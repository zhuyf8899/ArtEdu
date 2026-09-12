import { z } from "zod";

export const ragQuerySchema = z.object({
  query: z.string().trim().min(2).max(500),
  scope: z.enum(["course", "platform"]).default("course"),
  // 仅表示用户同意“本地证据不足时可联网检索问题”；不会上传课程正文。
  allowWebFallback: z.boolean().default(true),
});

export type RagQueryInput = z.infer<typeof ragQuerySchema>;
