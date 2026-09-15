import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { detectUploadMimeType, storePrivateUpload } from "./private-upload";
import { resolveWorkAssetPath } from "./work-asset-path";
import { StudioService } from "./studio.service";

test("作品新分层与旧 UUID 路径均可读取；越权、穿越和丢失文件被拒绝", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "artedu-case-path-"));
  const previous = process.env.UPLOAD_ROOT;
  process.env.UPLOAD_ROOT = root;
  try {
    const file = () => ({fieldname:"file",filename:"case.pdf",mimetype:"application/pdf",file:Readable.from([Buffer.from("%PDF-1.7\n")])}) as any;
    const nested = await storePrivateUpload(file(), root, undefined, "users/student-a/works/work-a");
    const legacy = await storePrivateUpload(file(), root);
    assert.equal((await readFile(await resolveWorkAssetPath(root,nested.storageKey,"student-a","work-a"))).subarray(0,5).toString(), "%PDF-");
    await resolveWorkAssetPath(root,legacy.storageKey,"student-a","work-a");
    for (const key of ["../outside", "C:/outside", "/etc/passwd", nested.storageKey.replace("student-a","student-b"), nested.storageKey.replace("work-a","work-b"), nested.storageKey.replaceAll("/","\\"), "%2e%2e/file"]) {
      await assert.rejects(resolveWorkAssetPath(root,key,"student-a","work-a"));
    }
    const asset = {storage_key:nested.storageKey, file_name:"case.pdf", mime_type:"application/pdf", asset_type:"document", status:"draft", author_id:"student-a", moderation_status:"pending",story_json:{allowDocumentDownload:false}};
    const service = new StudioService({query: async () => ({rows:[asset]})} as any, {} as any);
    const owner = {id:"student-a",roles:["student"]} as any;
    const stranger = {id:"student-b",roles:["student"]} as any;
    await assert.rejects(service.openWorkAsset(stranger,"work-a","asset-a"), /无权/);
    const output = await service.openWorkAsset(owner,"work-a","asset-a");
    const chunks = []; for await (const chunk of output.stream) chunks.push(chunk);
    assert.equal(Buffer.concat(chunks).subarray(0,5).toString(), "%PDF-");
    asset.status = "approved"; asset.moderation_status = "approved";
    await assert.rejects(service.openWorkAsset(stranger,"work-a","asset-a"), /未开放/);
    asset.story_json.allowDocumentDownload = true;
    const permitted = await service.openWorkAsset(stranger,"work-a","asset-a");
    for await (const chunk of permitted.stream) assert.ok(chunk.length);
    await rm(await resolveWorkAssetPath(root,nested.storageKey,"student-a","work-a"));
    await assert.rejects(service.openWorkAsset(owner,"work-a","asset-a"), /不存在/);
  } finally {
    if (previous === undefined) delete process.env.UPLOAD_ROOT; else process.env.UPLOAD_ROOT = previous;
    await rm(root,{recursive:true,force:true});
  }
});

test("上传文件按真实魔数识别，并拒绝伪装内容", () => {
  assert.equal(detectUploadMimeType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), "image/png");
  assert.equal(detectUploadMimeType(Buffer.from("%PDF-1.7\n", "ascii")), "application/pdf");
  assert.equal(detectUploadMimeType(Buffer.from("....ftypisom", "ascii")), "video/mp4");
  assert.equal(detectUploadMimeType(Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x93])), "video/webm");
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
    const stored = await storePrivateUpload(pdf, root, ["application/pdf"], "users/user-a/works/work-a");
    assert.equal(stored.mimeType, "application/pdf");
    assert.equal(stored.assetType, "document");
    assert.match(stored.storageKey, /^users\/user-a\/works\/work-a\/[a-f0-9-]{36}-[a-f0-9-]{36}$/i);
    assert.match((await readFile(path.join(root, ...stored.storageKey.split("/")))).toString("ascii"), /^%PDF-/);

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
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
