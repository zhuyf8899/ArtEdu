import { z } from "zod";

export const officeFormatSchema = z.enum(["docx", "pptx", "pdf"]);
export type OfficeFormat = z.infer<typeof officeFormatSchema>;

const text = (max: number) => z.string().trim().min(1).max(max);
const sectionSchema = z.object({
  heading: text(48),
  paragraphs: z.array(text(180)).max(2).default([]),
  bullets: z.array(text(80)).max(5).default([]),
}).strict().superRefine((section, ctx) => {
  const parts = [...section.paragraphs, ...section.bullets];
  if (!parts.length || parts.join("").length > 360) ctx.addIssue({ code: "custom", message: "每节正文须为 1 到 360 字，避免课件溢出" });
});

// Content, not executable markup. All exporters consume the same validated structure.
export const documentContentSchema = z.object({
  schemaVersion: z.literal(1),
  title: text(48),
  summary: text(160),
  sections: z.array(sectionSchema).min(1).max(11),
}).strict();
export type DocumentContent = z.infer<typeof documentContentSchema>;

export class DocumentContentError extends Error {}

export function parseDocumentContent(raw: string, pageCount?: number): DocumentContent {
  try {
    const parsed = documentContentSchema.parse(JSON.parse(raw));
    if (pageCount !== undefined && parsed.sections.length + 1 !== pageCount) throw new Error("slide count");
    return parsed;
  } catch {
    throw new DocumentContentError("文档内容结构或页数不符合要求，未生成文件，请重试或简化要求");
  }
}

export function documentPrompt(format: OfficeFormat, pageCount?: number) {
  return `你是 ArtEdu 中文艺术教育文档作者，输出真实正文，不要仅给制作建议。只输出一个合法 JSON 对象，不要代码围栏或额外字段。结构：{"schemaVersion":1,"title":"标题","summary":"用途与内容概述","sections":[{"heading":"章节标题","paragraphs":["段落"],"bullets":["要点"]}]}。标题最多48字，概述最多160字。每节标题最多48字，段落最多2段且每段180字以内，要点最多5条且每条80字以内，每节全部正文总计最多360字且非空。1到11节。正文使用纯文本，不输出 Markdown 标记、HTML、外部链接或虚构引用。格式为${format}。${format === "pptx" ? `封面独占1页，每节独占1页。${pageCount ? `必须恰好${pageCount - 1}节，共${pageCount}页（含封面），不能增加额外页。` : "按用户要求决定总页数（含封面），没有要求时使用5节加1页封面。"}` : "按主题组织连贯的正文，不能以空泛建议代替内容。"}`;
}

export function documentMarkdown(document: DocumentContent) {
  return [`## ${document.title}`, document.summary, ...document.sections.flatMap(s => [`### ${s.heading}`, ...s.paragraphs, ...s.bullets.map(b => `- ${b}`)])].join("\n\n");
}
