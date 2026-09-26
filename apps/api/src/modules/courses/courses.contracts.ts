import { z } from "zod";

const storageKeySchema = z.string().trim().min(1).max(500).refine(
  (value) => !value.startsWith("/") && !value.includes("\\") && !/[\u0000-\u001F\u007F]/.test(value)
    && value.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== ".."),
  "存储键必须是无绝对路径、无上级目录的对象存储相对路径",
);

const coverUrlSchema = z.string().trim().url().max(2000).refine((value) => {
  const url = new URL(value);
  return url.protocol === "https:" && !url.username && !url.password;
}, "封面链接必须是 HTTPS 图片地址");

const resourceMetadataFields = {
  title: z.string().trim().min(1).max(200),
  summary: z.string().trim().max(2000).default(""),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  coverUrl: coverUrlSchema.nullable().optional(),
  lessonId: z.string().trim().min(1).max(100).nullable().optional(),
};

export const uploadCourseResourceMetadataSchema = z.object(resourceMetadataFields);
export const updateCourseResourceMetadataSchema = z.object(resourceMetadataFields).partial().refine(
  (value) => Object.keys(value).length > 0,
  { message: "至少提供一个要更新的资料字段" },
);

export const listCoursesQuerySchema = z.object({
  query: z.string().trim().max(80).optional(),
  category: z.string().trim().max(40).optional(),
  difficulty: z.enum(["beginner", "intermediate", "advanced"]).optional(),
  featured: z.enum(["true", "false"]).optional(),
});

const lessonSchema = z.object({
  id: z.string().trim().min(1).max(100).optional(),
  title: z.string().trim().min(1).max(120),
  summary: z.string().trim().max(1000).optional().default(""),
  lessonType: z.enum(["lesson", "practice", "assignment", "workflow"]).default("lesson"),
  estimatedMinutes: z.coerce.number().int().min(0).max(1440).default(0),
  workflowId: z.string().trim().min(1).max(100).nullable().optional(),
  modelConfigIds: z.array(z.string().trim().min(1).max(100)).max(20).default([]),
});

export const createCourseSchema = z.object({
  title: z.string().trim().min(2).max(120),
  summary: z.string().trim().max(2000).optional().default(""),
  category: z.string().trim().min(1).max(40),
  difficulty: z.enum(["beginner", "intermediate", "advanced"]).default("beginner"),
  coverAssetKey: storageKeySchema.nullable().optional(),
  coverUrl: coverUrlSchema.nullable().optional(),
  isFeatured: z.boolean().default(false),
  lessons: z.array(lessonSchema).max(100).default([]),
});

export const updateCourseSchema = createCourseSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  { message: "至少提供一个要更新的字段" },
);

export const updateProgressSchema = z.object({
  progressPercent: z.coerce.number().int().min(0).max(100),
  watchedSeconds: z.coerce.number().int().min(0).max(86400).default(0),
  lastPositionSeconds: z.coerce.number().int().min(0).max(86400).default(0),
});

export const courseReviewDecisionSchema = z.object({
  status: z.enum(["approved", "rejected"]),
  note: z.string().trim().max(1000).optional().default(""),
});

export type CreateCourseInput = z.infer<typeof createCourseSchema>;
export type UpdateCourseInput = z.infer<typeof updateCourseSchema>;
export type ProgressInput = z.infer<typeof updateProgressSchema>;
export type CourseReviewDecisionInput = z.infer<typeof courseReviewDecisionSchema>;
export type UploadCourseResourceMetadataInput = z.infer<typeof uploadCourseResourceMetadataSchema>;
export type UpdateCourseResourceMetadataInput = z.infer<typeof updateCourseResourceMetadataSchema>;
