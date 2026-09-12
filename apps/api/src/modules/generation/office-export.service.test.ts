import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { OfficeExportService } from "./office-export.service";
import AdmZip from "adm-zip";
import { documentContentSchema, parseDocumentContent } from "./document-content";
import { documentHtml, pdfBrowserPath } from "./pdf-export";
import { runGenerationJobSchema } from "./generation.contracts";

const fixture = { schemaVersion: 1 as const, title: "传统纹样课程", summary: "通过观察与创作理解纹样结构。", sections: [
  { heading: "课程目标", paragraphs: ["了解纹样的重复与对称。"], bullets: ["理解纹样结构", "完成一份草图"] },
  { heading: "课堂活动", paragraphs: ["分组讨论与创作。"], bullets: ["分享作品并讨论"] },
] };

test("将模型结构化正文导出为 DOCX 与 PPTX", async () => {
  const uploadRoot = await mkdtemp(path.join(os.tmpdir(), "artedu-office-"));
  const previous = process.env.UPLOAD_ROOT;
  process.env.UPLOAD_ROOT = uploadRoot;
  try {
    const service = new OfficeExportService();
    const docx = await service.create("job-office-test", fixture, "docx");
    const pptx = await service.create("job-office-test", fixture, "pptx");
    assert.match(docx.fileName, /\.docx$/);
    assert.match(pptx.fileName, /\.pptx$/);
    assert.ok((await readFile(path.join(uploadRoot, docx.storageKey))).subarray(0, 2).equals(Buffer.from("PK")));
    assert.ok((await readFile(path.join(uploadRoot, pptx.storageKey))).subarray(0, 2).equals(Buffer.from("PK")));
    const wordZip = new AdmZip(await service.read(docx.storageKey));
    const wordXml = wordZip.readAsText("word/document.xml");
    assert.ok(wordXml.includes("课程目标") && wordXml.includes("课堂活动"));
    const slidesZip = new AdmZip(await service.read(pptx.storageKey));
    const slides = slidesZip.getEntries().filter(entry => /^ppt\/slides\/slide\d+\.xml$/.test(entry.entryName));
    assert.equal(slides.length, 3, "封面和每节各一页");
    assert.ok(slidesZip.readAsText("ppt/slides/slide2.xml").includes("课程目标"));
    assert.ok(slidesZip.readAsText("ppt/slides/slide3.xml").includes("课堂活动"));
    await assert.rejects(service.read("../outside"), /非法文件路径/);
    if (pdfBrowserPath()) {
      const pdf = await service.create("job-office-test", fixture, "pdf");
      assert.equal(pdf.mimeType, "application/pdf");
      assert.equal((await service.read(pdf.storageKey)).subarray(0, 5).toString(), "%PDF-");
    }
  } finally {
    if (previous === undefined) delete process.env.UPLOAD_ROOT;
    else process.env.UPLOAD_ROOT = previous;
    await rm(uploadRoot, { recursive: true, force: true });
  }
});

test("统一文档结构校验页数、长度及非法模型输出", () => {
  assert.equal(parseDocumentContent(JSON.stringify(fixture), 3).sections.length, 2);
  assert.throws(() => parseDocumentContent(JSON.stringify(fixture), 8), /页数/);
  assert.throws(() => parseDocumentContent("not json"), /结构/);
  assert.equal(documentContentSchema.safeParse({ ...fixture, sections: [{ heading: "超长", paragraphs: ["字".repeat(361)], bullets: [] }] }).success, false);
  assert.equal(documentContentSchema.safeParse({ ...fixture, sections: [] }).success, false);
});

test("导出格式与页数拒绝非法参数，PDF 模板转义模型文本", () => {
  const input = { jobType: "document", modelConfigId: "model", prompt: "教案" };
  assert.equal(runGenerationJobSchema.safeParse({ ...input, parameters: { outputFormat: "exe" } }).success, false);
  assert.equal(runGenerationJobSchema.safeParse({ ...input, parameters: { outputFormat: "pptx", pageCount: 100 } }).success, false);
  assert.equal(runGenerationJobSchema.safeParse({ ...input, parameters: { outputFormat: "pdf" } }).success, true);
  const html = documentHtml({ ...fixture, title: '<script>alert("x")</script>' });
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(html.includes("default-src 'none'"));
});
