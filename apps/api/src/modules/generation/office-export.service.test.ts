import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { OfficeExportService } from "./office-export.service";

test("将模型结构化正文导出为 DOCX 与 PPTX", async () => {
  const uploadRoot = await mkdtemp(path.join(os.tmpdir(), "artedu-office-"));
  const previous = process.env.UPLOAD_ROOT;
  process.env.UPLOAD_ROOT = uploadRoot;
  try {
    const service = new OfficeExportService();
    const content = "# 课程目标\n- 理解纹样结构\n- 完成一份草图\n# 课堂活动\n分组讨论与创作。";
    const docx = await service.create("job-office-test", "传统纹样课程教案", content, "docx");
    const pptx = await service.create("job-office-test", "传统纹样课程汇报", content, "pptx");
    assert.match(docx.fileName, /\.docx$/);
    assert.match(pptx.fileName, /\.pptx$/);
    assert.ok((await readFile(path.join(uploadRoot, docx.storageKey))).subarray(0, 2).equals(Buffer.from("PK")));
    assert.ok((await readFile(path.join(uploadRoot, pptx.storageKey))).subarray(0, 2).equals(Buffer.from("PK")));
  } finally {
    if (previous === undefined) delete process.env.UPLOAD_ROOT;
    else process.env.UPLOAD_ROOT = previous;
    await rm(uploadRoot, { recursive: true, force: true });
  }
});
