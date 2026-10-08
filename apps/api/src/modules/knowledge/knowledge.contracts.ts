import { z } from "zod";

const id = z.string().trim().min(1).max(160);
const status = z.enum(["draft", "published", "archived"]);
const binding = z.object({ targetType: z.enum(["course", "lesson", "workflow", "tool"]), targetId: id }).strict();
const edge = z.object({ toNodeId: id, relation: z.enum(["prerequisite", "related"]) }).strict();

export const nodeInputSchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).default(""),
  domain: z.string().trim().min(1).max(80).default("general"),
  sortOrder: z.number().int().min(0).max(100000).default(0),
  status: status.default("draft"),
}).strict();
export const nodeUpdateSchema = nodeInputSchema.partial().refine((value) => Object.keys(value).length > 0);
export const nodeLinksSchema = z.object({
  edges: z.array(edge).max(200),
  bindings: z.array(binding).max(200),
  goalIds: z.array(id).max(100),
}).strict();
export const goalInputSchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).default(""),
  sortOrder: z.number().int().min(0).max(100000).default(0),
  status: status.default("draft"),
}).strict();
export const goalUpdateSchema = goalInputSchema.partial().refine((value) => Object.keys(value).length > 0);
export const activityInputSchema = z.object({
  nodeId: id,
  activityType: z.enum(["learn", "practice", "create"]),
  minutes: z.number().int().min(0).max(1440).default(0),
  note: z.string().trim().max(1000).default(""),
  occurredAt: z.string().datetime({ offset: true }).optional(),
}).strict();
export const toolUsageInputSchema = z.object({ toolId: id }).strict();

export type NodeInput = z.infer<typeof nodeInputSchema>;
export type NodeUpdate = z.infer<typeof nodeUpdateSchema>;
export type NodeLinks = z.infer<typeof nodeLinksSchema>;
export type GoalInput = z.infer<typeof goalInputSchema>;
export type GoalUpdate = z.infer<typeof goalUpdateSchema>;
export type ActivityInput = z.infer<typeof activityInputSchema>;

export const learningPathInputSchema = z.object({ title: z.string().trim().min(1).max(120), nodeIds: z.array(id).max(100).refine(ids => new Set(ids).size === ids.length, '路径知识点不能重复') }).strict();
export type LearningPathInput = z.infer<typeof learningPathInputSchema>;
