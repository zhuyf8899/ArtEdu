import { z } from "zod";

export const caseStorySchema = z.object({
  version: z.literal(1).default(1),
  origin: z.enum(["unspecified", "platform", "collected"]).default("unspecified"),
  creators: z.array(z.string().trim().min(1).max(80)).max(12).default([]),
  tools: z.array(z.string().trim().min(1).max(80)).max(12).default([]),
  methods: z.array(z.string().trim().min(1).max(60)).max(12).default([]),
  authorization: z.enum(["pending", "confirmed"]).default("pending"),
  authorizationNote: z.string().trim().max(1000).default(""),
  allowDocumentDownload: z.boolean().default(false),
  coverAssetId: z.string().trim().max(100).default(""),
  reflection: z.string().trim().max(4000).default(""),
  steps: z.array(z.object({
    title: z.string().trim().min(1).max(160),
    description: z.string().trim().max(4000).default(""),
    prompt: z.string().trim().max(10000).default(""),
    tool: z.string().trim().max(160).default(""),
    parameters: z.string().trim().max(2000).default(""),
    outcome: z.string().trim().max(4000).default(""),
    assetIds: z.array(z.string().trim().min(1).max(100)).max(10).default([]),
  }).strict()).max(20).default([]),
}).strict();

export type CaseStory = z.infer<typeof caseStorySchema>;

// No executable HTML or model calls: prompts are only educational text.
export function assertCasePublication(story: CaseStory) {
  if (story.origin === "unspecified") {
    throw new Error("请先标明案例来源：ArtEdu 创作或外部收集案例");
  }
  if (story.origin === "collected" && (!story.creators.length || story.authorization !== "confirmed" || !story.authorizationNote)) {
    throw new Error("收集案例需填写原作者并确认展示授权及授权说明后，才能提交审核");
  }
}

export function assertCaseCover(imageCount: number) {
  if (imageCount < 1) throw new Error("提交审核前请至少上传一张图片作为案例封面；视频和文档可作为补充材料");
}
