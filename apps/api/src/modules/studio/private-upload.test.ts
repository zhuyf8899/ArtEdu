import assert from "node:assert/strict";
import test from "node:test";
import { detectUploadMimeType } from "./private-upload";

test("上传文件按真实魔数识别，并拒绝伪装内容", () => {
  assert.equal(detectUploadMimeType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), "image/png");
  assert.equal(detectUploadMimeType(Buffer.from("%PDF-1.7\n", "ascii")), "application/pdf");
  assert.equal(detectUploadMimeType(Buffer.from("<script>alert(1)</script>", "utf8")), undefined);
  assert.equal(detectUploadMimeType(Buffer.from("RIFF0000WAVE", "ascii")), undefined);
});
