import type { User } from "../domain/types.js";

export class QuotaError extends Error {
  constructor(public code: string, message: string, public status = 409) { super(message); }
}

export function assertCanConsume(user: User, cost: number) {
  if (user.status === "suspended") throw new QuotaError("USER_SUSPENDED", "账户已停用", 403);
  if (user.activeTasks >= user.concurrentLimit) throw new QuotaError("CONCURRENCY_EXCEEDED", "并发任务数已达上限");
  if (user.dailyUsed + cost > user.dailyLimit) throw new QuotaError("DAILY_QUOTA_EXCEEDED", "今日 API 额度不足");
  if (user.monthlyUsed + cost > user.monthlyLimit) throw new QuotaError("MONTHLY_QUOTA_EXCEEDED", "本月 API 额度不足");
}

export function consume(user: User, cost: number) {
  assertCanConsume(user, cost);
  user.dailyUsed += cost;
  user.monthlyUsed += cost;
  user.activeTasks += 1;
  if (user.monthlyUsed >= user.monthlyLimit || user.dailyUsed >= user.dailyLimit) user.status = "limited";
}
