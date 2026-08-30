import type { FastifyReply, FastifyRequest } from "fastify";

interface Bucket { count: number; resetAt: number; }
const buckets = new Map<string, Bucket>();
const WINDOW_MS = 60_000;

/** Local safety valve; use gateway or Redis-backed rate limiting for multi-instance deployment. */
export async function apiRateLimitHook(request: FastifyRequest, reply: FastifyReply) {
  const isWrite = !["GET", "HEAD", "OPTIONS"].includes(request.method);
  const limit = isWrite ? 30 : 120;
  const key = `${request.ip}:${isWrite ? "write" : "read"}`;
  const now = Date.now();
  const current = buckets.get(key);
  const bucket = !current || current.resetAt <= now ? { count: 0, resetAt: now + WINDOW_MS } : current;
  bucket.count += 1;
  buckets.set(key, bucket);
  if (buckets.size > 10_000) for (const [bucketKey, value] of buckets) if (value.resetAt <= now) buckets.delete(bucketKey);
  if (bucket.count <= limit) return;
  reply.header("Retry-After", String(Math.ceil((bucket.resetAt - now) / 1000)));
  return reply.code(429).send({ statusCode: 429, message: "请求过于频繁，请稍后再试", requestId: request.id });
}
