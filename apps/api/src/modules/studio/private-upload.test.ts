import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { detectUploadMimeType, storePrivateUpload } from "./private-upload";

test("上传文件按真实魔数识别，并拒绝伪装内容", () => {
  assert.equal(detectUploadMimeType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), "image/png");
  assert.equal(detectUploadMimeType(Buffer.from("%PDF-1.7\n", "ascii")), "application/pdf");
  assert.equal(detectUploadMimeType(Buffer.from("<script>alert(1)</script>", "utf8")), undefined);
  assert.equal(detectUploadMimeType(Buffer.from("RIFF0000WAVE", "ascii")), undefined);
});

test("课程资料上传接受安全识别的 PDF、DOCX，并在拒绝时清理临时文件", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "artedu-upload-test-"));
  try {
    const pdf = {
      fieldname: "file",
      filename: "lesson.pdf",
      mimetype: "application/pdf",
      file: Readable.from([Buffer.from("%PDF-1.7\\n", "ascii")]),
    } as any;
    const stored = await storePrivateUpload(pdf, root, ["application/pdf"]);
    assert.equal(stored.mimeType, "application/pdf");
    assert.equal(stored.assetType, "document");
    assert.match(stored.storageKey, /^[a-f0-9-]{36}-[a-f0-9-]{36}$/i);

    const docx = {
      fieldname: "file",
      filename: "lesson.docx",
      mimetype: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      file: Readable.from([Buffer.from("PK\x03\x04[Content_Types].xml word/document.xml", "latin1")]),
    } as any;
    const document = await storePrivateUpload(docx, root, ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"]);
    assert.equal(document.mimeType, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    assert.match(document.fileName, /\.docx$/);

    const image = {
      fieldname: "file",
      filename: "not-a-course.pdf",
      mimetype: "image/png",
      file: Readable.from([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])]),
    } as any;
    await assert.rejects(() => storePrivateUpload(image, root, ["application/pdf"]));
    assert.deepEqual((await readdir(root)).sort(), [stored.storageKey, document.storageKey].sort());
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
