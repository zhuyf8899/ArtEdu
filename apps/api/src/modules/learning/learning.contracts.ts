import { z } from "zod";

const dateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日期格式必须为 YYYY-MM-DD");

export const createLearningTaskSchema = z.object({
  title: z.string().trim().min(1, "任务名称不能为空").max(120),
  taskType: z.enum(["course", "workflow", "review", "note", "custom"]).default("custom"),
  targetId: z.string().trim().max(160).optional(),
  dueDate: dateOnlySchema.optional(),
});

export const updateLearningTaskSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  dueDate: dateOnlySchema.nullable().optional(),
  status: z.enum(["pending", "completed"]).optional(),
}).refine((input) => Object.keys(input).length > 0, "至少需要更新一个字段");

export const createLearningNoteSchema = z.object({
  title: z.string().trim().min(1, "笔记标题不能为空").max(120),
  content: z.string().trim().min(1, "笔记内容不能为空").max(6000),
  courseId: z.string().trim().max(160).optional(),
  lessonId: z.string().trim().max(160).optional(),
});

export const updateLearningNoteSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  content: z.string().trim().min(1).max(6000).optional(),
}).refine((input) => Object.keys(input).length > 0, "至少需要更新一个字段");

export type CreateLearningTaskInput = z.infer<typeof createLearningTaskSchema>;
export type UpdateLearningTaskInput = z.infer<typeof updateLearningTaskSchema>;
export type CreateLearningNoteInput = z.infer<typeof createLearningNoteSchema>;
export type UpdateLearningNoteInput = z.infer<typeof updateLearningNoteSchema>;
