import { z } from "zod";

function isSafeHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password;
  } catch {
    return false;
  }
}

const externalUrlSchema = z.string().trim().max(1000).refine(isSafeHttpUrl, "仅允许无凭据的 http(s) 链接");
const entryUrlSchema = z.string().trim().max(1000).refine(
  (value) => (value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\")) || isSafeHttpUrl(value),
  "仅允许站内路径或无凭据的 http(s) 链接",
);
const storageKeySchema = z.string().trim().min(1).max(1000).refine(
  (value) => !value.startsWith("/") && !value.includes("\\") && !/[\u0000-\u001F\u007F]/.test(value)
    && value.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== ".."),
  "存储键必须是无绝对路径、无上级目录的对象存储相对路径",
);
const fileNameSchema = z.string().trim().min(1).max(255).refine(
  (value) => !/[\\/\u0000-\u001F\u007F]/.test(value),
  "文件名不能包含路径分隔符或控制字符",
);
const mimeTypeSchema = z.string().trim().max(120).regex(/^[A-Za-z0-9!#$&^_.+-]+\/[A-Za-z0-9!#$&^_.+-]+$/, "MIME 类型格式不合法");

export const pageSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  query: z.string().trim().min(1).optional(),
  category: z.string().trim().min(1).optional(),
  discipline: z.string().trim().min(1).optional(),
  tag: z.string().trim().min(1).optional(),
});

export const courseInputSchema = z.object({
  title: z.string().trim().min(1).max(200),
  summary: z.string().trim().max(2000).optional(),
  category: z.string().trim().max(100).optional(),
  difficulty: z.enum(["beginner", "intermediate", "advanced"]).optional(),
  coverAssetKey: storageKeySchema.optional(),
  status: z.enum(["draft", "published", "archived"]).default("draft"),
});

export const lessonInputSchema = z.object({
  title: z.string().trim().min(1).max(200),
  summary: z.string().trim().max(2000).optional(),
  lessonType: z.enum(["lesson", "practice", "assignment"]).default("lesson"),
  sortOrder: z.number().int().min(0).default(0),
  estimatedMinutes: z.number().int().min(0).optional(),
  status: z.enum(["draft", "published", "archived"]).default("draft"),
});

const resourceFieldsSchema = z.object({
  title: z.string().trim().min(1).max(200),
  resourceType: z.enum(["pdf", "video", "word", "ppt", "book", "link", "other"]),
  lessonId: z.string().trim().optional(),
  storageKey: storageKeySchema.optional(),
  externalUrl: externalUrlSchema.optional(),
  fileName: fileNameSchema.optional(),
  mimeType: mimeTypeSchema.optional(),
  fileSize: z.number().int().min(0).optional(),
  transcriptText: z.string().optional(),
  sourceName: z.string().trim().max(200).optional(),
  sourceUrl: externalUrlSchema.optional(),
  copyrightNote: z.string().trim().max(1000).optional(),
  sortOrder: z.number().int().min(0).default(0),
  status: z.enum(["draft", "published", "archived"]).default("draft"),
});

export const resourceInputSchema = resourceFieldsSchema.refine((value) => Boolean(value.storageKey || value.externalUrl), {
  message: "storageKey 或 externalUrl 至少提供一个",
  path: ["storageKey"],
});
export const resourcePatchSchema = resourceFieldsSchema.partial();

export const workflowInputSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
  category: z.string().trim().max(100).optional(),
  entryType: z.enum(["chat", "workbench", "external_tool"]).default("chat"),
  entryUrl: entryUrlSchema.optional(),
  status: z.enum(["draft", "published", "archived"]).default("draft"),
});

export const workflowVersionSchema = z.object({
  definitionJson: z.record(z.unknown()).optional(),
  promptTemplate: z.string().trim().max(10000).optional(),
});

export const toolInputSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
  category: z.string().trim().max(100).optional(),
  toolType: z.enum(["internal", "external", "embedded"]),
  entryUrl: entryUrlSchema.optional(),
  status: z.enum(["draft", "published", "archived"]).default("draft"),
});

export const statusSchema = z.object({
  status: z.enum(["draft", "published", "archived", "pending", "approved", "rejected"]),
});

export const workInputSchema = z.object({
  title: z.string().trim().min(1).max(200),
  summary: z.string().trim().max(3000).optional(),
  discipline: z.string().trim().max(100).optional(),
  workflowIds: z.array(z.string().trim().min(1)).max(20).refine(
    (ids) => new Set(ids).size === ids.length,
    "工作流不能重复引用",
  ).default([]),
  assets: z.array(z.object({
    fileName: fileNameSchema,
    mimeType: mimeTypeSchema,
    storageKey: storageKeySchema,
    fileSize: z.number().int().min(0).optional(),
    assetType: z.enum(["image", "video", "document", "other"]).default("image"),
    thumbnailKey: storageKeySchema.optional(),
    altText: z.string().trim().max(500).optional(),
    sortOrder: z.number().int().min(0).default(0),
  })).max(50).default([]),
});

export const commentSchema = z.object({
  content: z.string().trim().min(1).max(2000),
  parentId: z.string().trim().optional(),
});

export const progressSchema = z.object({
  status: z.enum(["not_started", "in_progress", "completed"]).default("in_progress"),
  progressPercent: z.number().int().min(0).max(100),
  watchedSeconds: z.number().int().min(0).default(0),
  lastPositionSeconds: z.number().int().min(0).default(0),
});

export const conversationSchema = z.object({
  type: z.enum(["teaching", "design", "generation"]),
  title: z.string().trim().max(200).optional(),
  courseId: z.string().trim().optional(),
  workflowId: z.string().trim().optional(),
});

export const messageSchema = z.object({
  content: z.string().trim().min(1).max(20000),
});

export type PageInput = z.infer<typeof pageSchema>;
