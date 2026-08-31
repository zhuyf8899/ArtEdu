import { z } from "zod";

const safeHttpUrl = z.string().trim().max(1200).refine((value) => {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password;
  } catch {
    return false;
  }
}, "仅允许无账号信息的 http(s) 地址");

export const catalogQuerySchema = z.object({
  query: z.string().trim().max(100).optional(),
  category: z.string().trim().max(100).optional(),
  discipline: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

export const workflowInputSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().min(2).max(2000),
  category: z.string().trim().min(1).max(100),
  entryType: z.enum(["chat", "workbench", "external_tool"]).default("chat"),
  entryUrl: z.string().trim().max(1000).optional(),
});

const workflowStepSchema = z.object({
  id: z.string().trim().min(1).max(80),
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(1200).default(""),
  instruction: z.string().trim().max(4000).default(""),
  estimatedMinutes: z.number().int().min(0).max(1440).default(10),
});

export const workflowVersionInputSchema = z.object({
  steps: z.array(workflowStepSchema).min(1).max(30),
  promptTemplate: z.string().trim().max(10000).optional(),
  publish: z.boolean().default(false),
});

export const workflowRunInputSchema = z.object({
  context: z.record(z.unknown()).default({}),
});

export const workflowRunProgressSchema = z.object({
  stepIndex: z.number().int().min(0),
  action: z.enum(["complete", "skip", "note"]),
  note: z.string().trim().max(2000).optional(),
});

const workAssetSchema = z.object({
  externalUrl: safeHttpUrl,
  fileName: z.string().trim().min(1).max(255).refine((value) => !/[\\/\u0000-\u001F\u007F]/.test(value), "文件名不合法"),
  mimeType: z.string().trim().regex(/^(image|video|application)\/[A-Za-z0-9!#$&^_.+-]+$/, "资源类型不合法"),
  assetType: z.enum(["image", "video", "document", "other"]).default("image"),
  altText: z.string().trim().max(500).optional(),
});

export const workInputSchema = z.object({
  title: z.string().trim().min(2).max(160),
  summary: z.string().trim().min(2).max(3000),
  discipline: z.string().trim().min(1).max(100),
  workflowIds: z.array(z.string().trim().min(1)).max(10).default([]),
  tagNames: z.array(z.string().trim().min(1).max(40)).max(12).default([]),
  assets: z.array(workAssetSchema).max(20).default([]),
});

export const commentInputSchema = z.object({
  content: z.string().trim().min(1).max(2000),
});

export type CatalogQuery = z.infer<typeof catalogQuerySchema>;
export type WorkflowInput = z.infer<typeof workflowInputSchema>;
export type WorkflowVersionInput = z.infer<typeof workflowVersionInputSchema>;
export type WorkflowRunInput = z.infer<typeof workflowRunInputSchema>;
export type WorkflowRunProgressInput = z.infer<typeof workflowRunProgressSchema>;
export type WorkInput = z.infer<typeof workInputSchema>;
