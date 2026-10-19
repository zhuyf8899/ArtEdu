import { setTimeout as pause } from "node:timers/promises";
import { UNUSABLE_KEY_HTTP_STATUSES } from "./provider-api-keys";

export type ImageRequestStage = "submit" | "poll" | "download";

export class ImageTransportError extends Error {
  constructor(
    readonly stage: ImageRequestStage,
    readonly attempts: number,
    readonly code: string,
    readonly status?: number,
  ) {
    super(`图片${{ submit: "提交", poll: "查询", download: "下载" }[stage]}失败${status ? ` HTTP ${status}` : `（${code}）`}`);
    this.name = "ImageTransportError";
  }
}

const connectionFailures = new Set(["EAI_AGAIN", "ENOTFOUND", "ECONNREFUSED", "UND_ERR_CONNECT_TIMEOUT"]);
const readFailures = new Set([...connectionFailures, "ECONNRESET", "ETIMEDOUT", "UND_ERR_SOCKET", "UND_ERR_HEADERS_TIMEOUT", "UND_ERR_BODY_TIMEOUT", "TIMEOUT", "INVALID_RESPONSE", "EMPTY_IMAGE"]);
const readStatuses = new Set([408, 429, 500, 502, 503, 504]);

function failureCode(error: unknown) {
  const failure = error as { code?: unknown; cause?: { code?: unknown }; name?: string } | null;
  const code = failure?.cause?.code ?? failure?.code;
  if (typeof code === "string" && /^[A-Z0-9_]{1,80}$/.test(code)) return code;
  if (failure?.name === "TimeoutError" || failure?.name === "AbortError") return "TIMEOUT";
  if (failure?.name === "SyntaxError") return "INVALID_RESPONSE";
  return "NETWORK_ERROR";
}

export async function imageRequest<Value>(
  url: string | URL,
  init: RequestInit,
  options: { stage: ImageRequestStage; timeoutMs: number; signal?: AbortSignal; retryBaseMs?: number },
  read: (response: Response) => Promise<Value>,
): Promise<Value> {
  options.signal?.throwIfAborted();
  const deadline = Date.now() + options.timeoutMs;
  const totalSignal = AbortSignal.timeout(Math.max(1, options.timeoutMs));
  const signal = options.signal ? AbortSignal.any([options.signal, totalSignal]) : totalSignal;
  const submission = options.stage === "submit";
  for (let attempt = 1; attempt <= 3; attempt++) {
    let retryAfter = 0;
    try {
      signal.throwIfAborted();
      const attemptSignal = submission ? signal : AbortSignal.any([signal, AbortSignal.timeout(Math.min(30000, Math.max(1, deadline - Date.now())))]);
      const response = await fetch(url, { ...init, signal: attemptSignal });
      if (!response.ok) {
        const header = response.headers.get("retry-after");
        if (header) {
          const seconds = Number(header);
          retryAfter = Number.isFinite(seconds) ? Math.max(0, seconds * 1000) : Math.max(0, Date.parse(header) - Date.now()) || 0;
        }
        await response.body?.cancel().catch(() => undefined);
        throw new ImageTransportError(options.stage, attempt, `HTTP_${response.status}`, response.status);
      }
      return await read(response);
    } catch (error) {
      options.signal?.throwIfAborted();
      const failure = error instanceof ImageTransportError ? new ImageTransportError(options.stage, attempt, error.code, error.status) : new ImageTransportError(options.stage, attempt, failureCode(error));
      const retryable = failure.status !== undefined
        ? submission ? failure.status === 429 : readStatuses.has(failure.status)
        : submission ? connectionFailures.has(failure.code) : readFailures.has(failure.code) || failure.code === "NETWORK_ERROR";
      const base = options.retryBaseMs ?? 400;
      const delay = Math.max(retryAfter, base * 2 ** (attempt - 1) + Math.random() * base);
      if (!retryable || attempt === 3 || signal.aborted || Date.now() + delay >= deadline) throw failure;
      try { await pause(delay, undefined, { signal }); }
      catch {
        options.signal?.throwIfAborted();
        throw failure;
      }
    }
  }
  throw new ImageTransportError(options.stage, 3, "NETWORK_ERROR");
}

export async function withImageApiKeys<Value>(keys: string[], execute: (key: string) => Promise<Value>): Promise<Value> {
  for (const [index, key] of keys.entries()) {
    try { return await execute(key); }
    catch (error) {
      if (!(error instanceof ImageTransportError) || error.status === undefined || !UNUSABLE_KEY_HTTP_STATUSES.has(error.status) || index === keys.length - 1) throw error;
    }
  }
  throw new Error("图片服务未配置 API Key");
}

export async function downloadGeneratedImage(url: string, timeoutMs: number, signal?: AbortSignal) {
  if (new URL(url).protocol !== "https:") throw new Error("图片供应商返回了不安全的下载地址");
  return imageRequest(url, {}, { stage: "download", timeoutMs, signal }, async response => {
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length) throw new ImageTransportError("download", 1, "EMPTY_IMAGE");
    const declared = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
    const mimeType = declared?.startsWith("image/") ? declared
      : /\.jpe?g(\?|$)/i.test(url) ? "image/jpeg" : /\.webp(\?|$)/i.test(url) ? "image/webp" : "image/png";
    return { bytes, mimeType };
  });
}
