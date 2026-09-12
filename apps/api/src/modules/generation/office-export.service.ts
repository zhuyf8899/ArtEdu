import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { Document, HeadingLevel, Packer, Paragraph, TextRun, Footer, PageNumber, AlignmentType } from "docx";
import PptxGenJS from "pptxgenjs";
import { getEnvironment } from "../../common/environment";
import { documentContentSchema, type DocumentContent, type OfficeFormat } from "./document-content";
import { createPdf } from "./pdf-export";
export type { OfficeFormat } from "./document-content";

export interface OfficeArtifact { storageKey: string; fileName: string; mimeType: string; fileSize: number; }
export const officeMimeTypes: Record<OfficeFormat, string> = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  pdf: "application/pdf",
};
export function outputExtension(mimeType: string) {
  return Object.entries(officeMimeTypes).find(([, value]) => value === mimeType)?.[0];
}

@Injectable()
export class OfficeExportService {
  async create(jobId: string, content: DocumentContent, format: OfficeFormat): Promise<OfficeArtifact> {
    const document = documentContentSchema.parse(content);
    const fileName = `${safeFileStem(document.title)}-${jobId.slice(0, 8)}.${format}`;
    const storageKey = path.posix.join("generated", jobId, `${randomUUID()}.${format}`);
    const absolutePath = safeJoin(path.resolve(getEnvironment().uploadRoot), storageKey);
    // Render fully before writing, so exporter failures cannot leave partial downloads.
    const bytes = format === "docx" ? await createDocx(document) : format === "pptx" ? await createPptx(document) : await createPdf(document);
    await mkdir(path.dirname(absolutePath), { recursive: true, mode: 0o700 });
    await writeFile(absolutePath, bytes, { mode: 0o600, flag: "wx" });
    return { storageKey, fileName, mimeType: officeMimeTypes[format], fileSize: bytes.length };
  }
  async read(storageKey: string) { return readFile(safeJoin(path.resolve(getEnvironment().uploadRoot), storageKey)); }
  async remove(storageKey: string) { await unlink(safeJoin(path.resolve(getEnvironment().uploadRoot), storageKey)); }
}
function safeJoin(root: string, storageKey: string) {
  const target = path.resolve(root, storageKey);
  if (!target.startsWith(`${root}${path.sep}`)) throw new Error("非法文件路径");
  return target;
}
async function createDocx(doc: DocumentContent) {
  const children = [new Paragraph({ text: doc.title, heading: HeadingLevel.TITLE }), new Paragraph({ text: doc.summary, spacing: { after: 240 } }),
    ...doc.sections.flatMap(section => [new Paragraph({ text: section.heading, heading: HeadingLevel.HEADING_1, keepNext: true }),
      ...section.paragraphs.map(text => new Paragraph({ text })),
      ...section.bullets.map(text => new Paragraph({ text, bullet: { level: 0 } }))])];
  return Packer.toBuffer(new Document({
    creator: "ArtEdu",
    styles: { default: { document: { run: { font: "Microsoft YaHei", size: 22, color: "000000" }, paragraph: { spacing: { after: 160, line: 340 } } },
      title: { run: { font: "Microsoft YaHei", size: 44, color: "000000", bold: true }, paragraph: { spacing: { after: 240 } } },
      heading1: { run: { font: "Microsoft YaHei", size: 30, color: "000000", bold: true }, paragraph: { spacing: { before: 260, after: 140 } } } } },
    sections: [{ properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1247, bottom: 1247, left: 1134, right: 1134 } } },
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: [PageNumber.CURRENT], size: 18 })] })] }) }, children }],
  }));
}
async function createPptx(doc: DocumentContent) {
  const presentation = new PptxGenJS();
  presentation.layout = "LAYOUT_WIDE";
  presentation.author = "ArtEdu";
  presentation.title = doc.title;
  presentation.theme = { headFontFace: "Microsoft YaHei", bodyFontFace: "Microsoft YaHei" };
  const cover = presentation.addSlide();
  cover.background = { color: "F7F5F1" };
  cover.addText(doc.title, { x: 0.8, y: 1.1, w: 11.6, h: 2.2, fontSize: 42, bold: true, color: "172033", margin: 0 });
  cover.addText(doc.summary, { x: 0.85, y: 3.7, w: 11.1, h: 2.2, fontSize: 20, color: "596579", margin: 0, valign: "top" });
  // Each section owns a slide: no dropped headings or arbitrary six-block splitting.
  for (const [index, section] of doc.sections.entries()) {
    const slide = presentation.addSlide();
    slide.background = { color: "FFFFFF" };
    slide.addText(section.heading, { x: 0.75, y: 0.45, w: 11.8, h: 1.2, fontSize: 32, bold: true, color: "172033", margin: 0 });
    const body = [
      ...section.paragraphs.map(text => ({ text, options: { breakLine: true } })),
      ...section.bullets.map(text => ({ text, options: { bullet: { indent: 20 }, hanging: 4, breakLine: true } })),
    ];
    slide.addText(body, { x: 0.95, y: 1.95, w: 11.2, h: 4.8, fontSize: 20, color: "334155", margin: 0, paraSpaceAfter: 10, valign: "top" });
    slide.addText(`ArtEdu   ${index + 2} / ${doc.sections.length + 1}`, { x: 9.8, y: 7.08, w: 2.5, h: 0.22, fontSize: 10, color: "64748B", align: "right", margin: 0 });
  }
  return presentation.write({ outputType: "nodebuffer" }) as Promise<Buffer>;
}
function safeFileStem(value: string) { return value.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-").replace(/\s+/g, "-").slice(0, 60) || "artedu-document"; }
