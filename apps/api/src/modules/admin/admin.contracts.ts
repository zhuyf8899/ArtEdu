import { z } from "zod";

export const listUsersQuerySchema = z.object({
  query: z.string().trim().min(1).max(80).optional(),
  status: z.enum(["active", "limited", "suspended", "pending"]).optional(),
});

export const quotaSchema = z.object({
  dailyLimit: z.coerce.number().int().min(0).max(100000),
  monthlyLimit: z.coerce.number().int().min(0).max(1000000),
  concurrentLimit: z.coerce.number().int().min(0).max(100),
});

export const bulkQuotaSchema = z.object({
  userIds: z.array(z.string().trim().min(1).max(160)).min(1).max(200).refine((ids) => new Set(ids).size === ids.length, "用户不能重复"),
  quota: quotaSchema,
});

export const accountStatusSchema = z.object({
  // 兼容已完成的管理端用语；后端实际只更新 users.status。
  status: z.enum(["active", "suspended"]),
});

export const reviewDecisionSchema = z.object({
  status: z.enum(["approved", "rejected"]),
  note: z.string().trim().max(1000).optional().default(""),
});

export type QuotaInput = z.infer<typeof quotaSchema>;
export type BulkQuotaInput = z.infer<typeof bulkQuotaSchema>;
export type ReviewDecisionInput = z.infer<typeof reviewDecisionSchema>;
