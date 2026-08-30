import { z } from "zod";

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
  coverAssetKey: z.string().trim().max(500).optional(),
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
  storageKey: z.string().trim().max(1000).optional(),
  externalUrl: z.string().url().optional(),
  fileName: z.string().trim().max(255).optional(),
  mimeType: z.string().trim().max(120).optional(),
  fileSize: z.number().int().min(0).optional(),
  transcriptText: z.string().optional(),
  sourceName: z.string().trim().max(200).optional(),
  sourceUrl: z.string().url().optional(),
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
  entryUrl: z.string().trim().max(1000).optional(),
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
  entryUrl: z.string().trim().max(1000).optional(),
  status: z.enum(["draft", "published", "archived"]).default("draft"),
});

export const statusSchema = z.object({
  status: z.enum(["draft", "published", "archived", "pending", "approved", "rejected"]),
});

export const workInputSchema = z.object({
  title: z.string().trim().min(1).max(200),
  summary: z.string().trim().max(3000).optional(),
  discipline: z.string().trim().max(100).optional(),
  workflowIds: z.array(z.string().trim().min(1)).max(20).default([]),
  assets: z.array(z.object({
    fileName: z.string().trim().min(1).max(255),
    mimeType: z.string().trim().min(1).max(120),
    storageKey: z.string().trim().min(1).max(1000),
    fileSize: z.number().int().min(0).optional(),
    assetType: z.enum(["image", "video", "document", "other"]).default("image"),
    thumbnailKey: z.string().trim().max(1000).optional(),
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
