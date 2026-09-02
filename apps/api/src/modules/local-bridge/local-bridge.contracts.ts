import { z } from "zod";

export const pairBridgeSchema = z.object({ displayName: z.string().trim().min(1).max(80).default("My Local Bridge") });
export const bridgeResultSchema = z.object({
  providerId: z.string().trim().min(1).max(80), model: z.string().trim().min(1).max(160),
  content: z.string().trim().min(1).max(100000),
});
export const bridgeFailureSchema = z.object({ reason: z.string().trim().min(1).max(1000) });
