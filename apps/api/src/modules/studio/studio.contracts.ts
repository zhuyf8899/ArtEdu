import { z } from "zod";

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
  entryUrl: z.string().trim().max(1000).refine((value) => {
    try {
      const url = new URL(value);
      return (url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password;
    } catch {
      return false;
    }
  }, "入口地址必须是无凭据的 HTTP(S) 地址").optional(),
});

export const workflowUpdateSchema = workflowInputSchema.partial();

const workflowStepSchema = z.object({
  id: z.string().trim().min(1).max(80),
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(1200).default(""),
  instruction: z.string().trim().max(4000).default(""),
  estimatedMinutes: z.number().int().min(0).max(1440).default(10),
});

const graphPointSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
});

const workflowNodeSchema = z.object({
  id: z.string().trim().min(1).max(80),
  type: z.enum(["input", "prompt", "model", "preview", "note"]),
  position: graphPointSchema,
  data: z.object({
    label: z.string().trim().min(1).max(160),
    description: z.string().trim().max(1200).default(""),
    value: z.string().trim().max(10000).optional(),
  }).passthrough(),
});

const workflowEdgeSchema = z.object({
  id: z.string().trim().min(1).max(120),
  source: z.string().trim().min(1).max(80),
  sourceHandle: z.string().trim().min(1).max(80).optional(),
  target: z.string().trim().min(1).max(80),
  targetHandle: z.string().trim().min(1).max(80).optional(),
});

export const workflowDefinitionSchema = z.object({
  schemaVersion: z.literal(2).default(2),
  nodes: z.array(workflowNodeSchema).min(1).max(80),
  edges: z.array(workflowEdgeSchema).max(160).default([]),
  viewport: z.object({ x: z.number().finite(), y: z.number().finite(), zoom: z.number().positive().max(4) }).default({ x: 0, y: 0, zoom: 1 }),
}).superRefine((definition, context) => {
  const nodeIds = new Set<string>();
  for (const node of definition.nodes) {
    if (nodeIds.has(node.id)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["nodes"], message: "节点 ID 不能重复" });
    nodeIds.add(node.id);
  }
  const edgeIds = new Set<string>();
  for (const edge of definition.edges) {
    if (edgeIds.has(edge.id)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["edges"], message: "连线 ID 不能重复" });
    edgeIds.add(edge.id);
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["edges"], message: "连线必须连接到已有节点" });
    if (edge.source === edge.target) context.addIssue({ code: z.ZodIssueCode.custom, path: ["edges"], message: "节点不能连接到自身" });
  }
});

export const workflowVersionInputSchema = z.object({
  definition: workflowDefinitionSchema.optional(),
  // 兼容已发布的线性教学工作流；新版本一律以 definition 保存节点图。
  steps: z.array(workflowStepSchema).min(1).max(30).optional(),
  promptTemplate: z.string().trim().max(10000).optional(),
  publish: z.boolean().default(false),
}).superRefine((input, context) => {
  if (!input.definition && !input.steps) context.addIssue({ code: z.ZodIssueCode.custom, message: "工作流版本必须包含节点图或结构化步骤" });
});

export const workflowRunInputSchema = z.object({
  context: z.record(z.unknown()).default({}),
});

export const workflowRunProgressSchema = z.object({
  stepIndex: z.number().int().min(0),
  action: z.enum(["complete", "skip", "note"]),
  note: z.string().trim().max(2000).optional(),
});

export const workInputSchema = z.object({
  title: z.string().trim().min(2).max(160),
  summary: z.string().trim().min(2).max(3000),
  discipline: z.string().trim().min(1).max(100),
  workflowIds: z.array(z.string().trim().min(1)).max(10).default([]),
  tagNames: z.array(z.string().trim().min(1).max(40)).max(12).default([]),
}).strict();

export const commentInputSchema = z.object({
  content: z.string().trim().min(1).max(2000),
});

export type CatalogQuery = z.infer<typeof catalogQuerySchema>;
export type WorkflowInput = z.infer<typeof workflowInputSchema>;
export type WorkflowVersionInput = z.infer<typeof workflowVersionInputSchema>;
export type WorkflowRunInput = z.infer<typeof workflowRunInputSchema>;
export type WorkflowRunProgressInput = z.infer<typeof workflowRunProgressSchema>;
export type WorkInput = z.infer<typeof workInputSchema>;
