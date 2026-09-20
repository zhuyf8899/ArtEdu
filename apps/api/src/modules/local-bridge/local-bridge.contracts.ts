import { z } from "zod";

export const pairBridgeSchema = z.object({
  displayName: z.string().trim().min(1).max(80).default("My Local Bridge"),
  // 令牌始终受服务器设置的 LOCAL_BRIDGE_TOKEN_DAYS 上限约束；客户端只能选择更短期限。
  tokenDays: z.number().int().min(1).max(90).default(30),
});
export const bridgeResultSchema = z.object({
  providerId: z.string().trim().min(1).max(80), model: z.string().trim().min(1).max(160),
  content: z.string().trim().min(1).max(100000),
});
export const bridgeFailureSchema = z.object({ reason: z.string().trim().min(1).max(1000) });
