import { z } from "zod";

export const createGenerationJobSchema = z.object({
  jobType: z.enum(["image", "video", "webpage", "pattern", "document", "knowledge_graph"]),
  prompt: z.string().trim().min(1).max(10000),
  conversationId: z.string().trim().min(1).max(120).optional(),
  workflowVersionId: z.string().trim().min(1).max(120).optional(),
  toolId: z.string().trim().min(1).max(120).optional(),
  modelConfigId: z.string().trim().min(1).max(120).optional(),
  parameters: z.record(z.string(), z.unknown()).default({}),
});

export const runGenerationJobSchema = createGenerationJobSchema.extend({
  modelConfigId: z.string().trim().min(1).max(120),
});

export type CreateGenerationJobInput = z.infer<typeof createGenerationJobSchema>;
export type RunGenerationJobInput = z.infer<typeof runGenerationJobSchema>;
