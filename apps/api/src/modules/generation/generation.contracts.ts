import { z } from "zod";

export const createGenerationJobSchema = z.object({
  jobType: z.enum(["image", "video", "webpage", "pattern", "document", "knowledge_graph"]),
  prompt: z.string().trim().min(1).max(10000),
  context: z.array(z.object({ role: z.enum(["system", "user", "assistant"]), content: z.string().trim().min(1).max(20000) })).max(30).default([]),
  conversationId: z.string().trim().min(1).max(120).optional(),
  workflowVersionId: z.string().trim().min(1).max(120).optional(),
  toolId: z.string().trim().min(1).max(120).optional(),
  modelConfigId: z.string().trim().min(1).max(120).optional(),
  parameters: z.record(z.string(), z.unknown()).default({}),
});

export const runGenerationJobSchema = createGenerationJobSchema.extend({
  modelConfigId: z.string().trim().min(1).max(120),
});

type ParsedGenerationJobInput = z.infer<typeof createGenerationJobSchema>;
type ParsedRunGenerationJobInput = z.infer<typeof runGenerationJobSchema>;
// 服务层兼容既有调用方；HTTP 校验后仍会把缺失值归一化为 []。
export type CreateGenerationJobInput = Omit<ParsedGenerationJobInput, "context"> & { context?: ParsedGenerationJobInput["context"] };
export type RunGenerationJobInput = Omit<ParsedRunGenerationJobInput, "context"> & { context?: ParsedRunGenerationJobInput["context"] };
