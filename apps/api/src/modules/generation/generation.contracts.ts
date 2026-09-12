import { z } from "zod";
import { officeFormatSchema } from "./document-content";

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
  modelConfigId: z.string().trim().min(1).max(120).optional(),
}).superRefine((input, context) => {
  // Image jobs may use main's internal image provider; text/document jobs still select an explicit model.
  if (!input.modelConfigId && !["image", "pattern"].includes(input.jobType)) context.addIssue({ code: "custom", path: ["modelConfigId"], message: "请选择服务端模型配置" });
  if (input.jobType !== "document") return;
  const format = officeFormatSchema.safeParse(input.parameters.outputFormat ?? "docx");
  if (!format.success) context.addIssue({ code: "custom", path: ["parameters", "outputFormat"], message: "文档格式仅支持 docx、pptx、pdf" });
  if (input.parameters.pageCount !== undefined && (format.data !== "pptx" || !z.number().int().min(2).max(12).safeParse(input.parameters.pageCount).success)) {
    context.addIssue({ code: "custom", path: ["parameters", "pageCount"], message: "PPT 页数必须为 2 到 12 的整数（含封面）" });
  }
});

type ParsedGenerationJobInput = z.infer<typeof createGenerationJobSchema>;
type ParsedRunGenerationJobInput = z.infer<typeof runGenerationJobSchema>;
// 服务层兼容既有调用方；HTTP 校验后仍会把缺失值归一化为 []。
export type CreateGenerationJobInput = Omit<ParsedGenerationJobInput, "context"> & { context?: ParsedGenerationJobInput["context"] };
export type RunGenerationJobInput = Omit<ParsedRunGenerationJobInput, "context"> & { context?: ParsedRunGenerationJobInput["context"] };
