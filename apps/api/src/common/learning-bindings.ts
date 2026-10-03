import { z } from "zod";

// Author-authored labels describe content, not a score or proof of mastery.
export const learningLabelsSchema = z.array(z.string().trim().min(1).max(80)
  .refine((value) => !/[\u0000-\u001f\u007f]/.test(value), "名称不能包含控制字符"))
  .max(20).transform((labels) => [...new Set(labels)]);

export const workflowLearningSchema = z.object({
  knowledgePoints: learningLabelsSchema.default([]),
  tools: learningLabelsSchema.default([]),
  abilityGoals: learningLabelsSchema.default([]),
}).strict();
