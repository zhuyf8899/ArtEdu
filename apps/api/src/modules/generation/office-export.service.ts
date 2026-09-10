import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";
import PptxGenJS from "pptxgenjs";
import { getEnvironment } from "../../common/environment";

export type OfficeFormat = "docx" | "pptx";

export interface OfficeArtifact {
  storageKey: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
}

const mimeTypes: Record<OfficeFormat, string> = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

@Injectable()
export class OfficeExportService {
  async create(jobId: string, prompt: string, content: string, format: OfficeFormat): Promise<OfficeArtifact> {
    const title = titleFromPrompt(prompt);
    const fileName = `${safeFileStem(title)}-${jobId.slice(0, 8)}.${format}`;
    const storageKey = path.posix.join("generated", jobId, `${randomUUID()}.${format}`);
    const root = path.resolve(getEnvironment().uploadRoot);
    const absolutePath = safeJoin(root, storageKey);
    await mkdir(path.dirname(absolutePath), { recursive: true, mode: 0o700 });
    const bytes = format === "docx" ? await createDocx(title, content) : await createPptx(title, content);
    await writeFile(absolutePath, bytes, { mode: 0o600 });
    const file = await stat(absolutePath);
    return { storageKey, fileName, mimeType: mimeTypes[format], fileSize: file.size };
  }

  async read(storageKey: string) {
    return readFile(safeJoin(path.resolve(getEnvironment().uploadRoot), storageKey));
  }
}

function safeJoin(root: string, storageKey: string) {
  const target = path.resolve(root, storageKey);
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) throw new Error("非法文件路径");
  return target;
}

async function createDocx(title: string, content: string) {
  const children = [new Paragraph({ text: title, heading: HeadingLevel.TITLE }), ...toBlocks(content).map((block) => block.kind === "heading" ? new Paragraph({ text: block.text, heading: HeadingLevel.HEADING_1 }) : block.kind === "bullet" ? new Paragraph({ text: block.text, bullet: { level: 0 } }) : new Paragraph({ children: [new TextRun(block.text)] }))];
  return Packer.toBuffer(new Document({ sections: [{ children }] }));
}

async function createPptx(title: string, content: string) {
  const presentation = new PptxGenJS();
  presentation.layout = "LAYOUT_WIDE";
  presentation.author = "ArtEdu";
  presentation.title = title;
  const cover = presentation.addSlide();
  cover.background = { color: "F7F5F1" };
  cover.addText(title, { x: 0.8, y: 1.25, w: 11.6, h: 0.8, fontFace: "Microsoft YaHei", fontSize: 28, bold: true, color: "172033", margin: 0 });
  cover.addText("由 ArtEdu AI 根据你的创作说明生成", { x: 0.82, y: 2.2, w: 8.6, h: 0.35, fontFace: "Microsoft YaHei", fontSize: 13, color: "596579", margin: 0 });
  const pages = chunk(toBlocks(content).filter((block) => block.text.length > 0), 6);
  for (const [index, page] of pages.entries()) {
    const slide = presentation.addSlide();
    slide.background = { color: "FFFFFF" };
    const heading = page.find((block) => block.kind === "heading")?.text ?? `内容要点 ${index + 1}`;
    slide.addText(heading, { x: 0.7, y: 0.55, w: 11.8, h: 0.45, fontFace: "Microsoft YaHei", fontSize: 22, bold: true, color: "172033", margin: 0 });
    const body = page.filter((block) => block.kind !== "heading").map((block) => ({ text: block.text, options: { bullet: { indent: 16 }, hanging: 3, breakLine: true } }));
    slide.addText(body.length ? body : [{ text: "请根据创作目标补充具体内容。", options: { breakLine: true } }], { x: 0.95, y: 1.35, w: 10.9, h: 4.9, fontFace: "Microsoft YaHei", fontSize: 16, color: "334155", margin: 0.08, paraSpaceAfter: 12, valign: "top" });
    slide.addText(`ArtEdu · ${index + 1}/${pages.length}`, { x: 10.45, y: 7.05, w: 2.1, h: 0.2, fontFace: "Microsoft YaHei", fontSize: 9, color: "64748B", align: "right", margin: 0 });
  }
  return presentation.write({ outputType: "nodebuffer" }) as Promise<Buffer>;
}

function toBlocks(content: string) {
  return content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
    if (/^#{1,3}\s+/.test(line)) return { kind: "heading" as const, text: line.replace(/^#{1,3}\s+/, "") };
    if (/^[-*•]\s+/.test(line) || /^\d+[.、]\s+/.test(line)) return { kind: "bullet" as const, text: line.replace(/^(?:[-*•]|\d+[.、])\s+/, "") };
    return { kind: "paragraph" as const, text: line };
  });
}

function titleFromPrompt(prompt: string) { return prompt.replace(/\s+/g, " ").trim().slice(0, 56) || "ArtEdu 文档"; }
function safeFileStem(value: string) { return value.replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, "-").slice(0, 60) || "artedu-document"; }
function chunk<T>(items: T[], size: number) { return Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size)); }
