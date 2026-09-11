import { randomUUID } from "node:crypto";
import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { getEnvironment } from "../../common/environment";
import type { ModelAdapter, ModelProviderConfig, ModelRequest, ModelResult } from "./model-adapter";

// ModelScope（魔搭）文生图不是 OpenAI 的 chat/completions：
//   1. POST {base}/v1/images/generations （带 X-ModelScope-Async-Mode: true）提交异步任务，拿 task_id
//   2. GET  {base}/v1/tasks/{task_id} 轮询，直到 SUCCEED/FAILED
//   3. 从 output_images[0] 下载图片，写入上传目录（与 Office 导出同一套存储约定）
// 因此它单独实现 ModelAdapter，而不是复用 OpenAICompatibleAdapter。
const POLL_INTERVAL_MS = 3000;
const MAX_PROMPT_CHARS = 1500;
// 默认方图：Qwen-Image 不加 size 时返回 760×1280 竖图，在对话面板里会被迫滚动；
// 图标/纹样/UI 这类用途方图也更合适。可用 providerOptions.size 覆盖（如 "1328x1328"）。
const DEFAULT_IMAGE_SIZE = "1024x1024";

export class ModelScopeImageAdapter implements ModelAdapter {
  constructor(private readonly config: ModelProviderConfig) {}

  get id() { return this.config.id; }
  get capabilities() { return this.config.capabilities; }

  async execute(request: ModelRequest): Promise<ModelResult> {
    if (!this.config.capabilities.includes(request.jobType)) {
      throw new Error(`模型 ${this.config.id} 不支持任务类型 ${request.jobType}`);
    }
    const apiKey = this.config.apiKeyEnv ? process.env[this.config.apiKeyEnv]?.trim() : undefined;
    if (!apiKey) throw new Error(`模型 ${this.config.id} 未配置环境变量 ${this.config.apiKeyEnv ?? "API key"}`);

    const prompt = this.resolvePrompt(request);
    const size = this.resolveSize(request);
    const jobId = request.jobId ?? randomUUID();
    const deadline = Date.now() + this.config.timeoutMs;

    const taskId = await this.submit(apiKey, prompt, size);
    const imageUrl = await this.waitForImage(apiKey, taskId, deadline);

    const response = await fetch(imageUrl, { signal: AbortSignal.timeout(Math.max(5000, deadline - Date.now())) });
    if (!response.ok) throw new Error(`下载生成图片失败 HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length === 0) throw new Error("模型接口返回了空图片");

    const mimeType = normalizeImageMime(response.headers.get("content-type"), imageUrl);
    const storageKey = path.posix.join("generated", jobId, `${randomUUID()}.${extensionFor(mimeType)}`);
    const absolutePath = safeJoin(path.resolve(getEnvironment().uploadRoot), storageKey);
    await mkdir(path.dirname(absolutePath), { recursive: true, mode: 0o700 });
    await writeFile(absolutePath, bytes, { mode: 0o600 });
    const file = await stat(absolutePath);

    return {
      kind: "asset",
      // content 复用为存储键：generation.service 据此写入 generation_outputs，
      // 再由 /api/generation-jobs/:jobId/download 读出。
      content: storageKey,
      mimeType,
      metadata: {
        providerId: this.id,
        model: this.config.model,
        taskId,
        fileName: `${safeFileStem(prompt)}-${jobId.slice(0, 8)}.${extensionFor(mimeType)}`,
        fileSize: file.size,
        imageUrl,
        inputTokens: 0,
        outputTokens: 0,
      },
    };
  }

  private resolvePrompt(request: ModelRequest): string {
    const fromMessages = [...(request.messages ?? [])].reverse().find((message) => message.role === "user")?.content;
    const prompt = (fromMessages ?? request.prompt ?? "").replace(/\s+/g, " ").trim();
    if (!prompt) throw new Error("图像生成至少需要一段提示词");
    return prompt.slice(0, MAX_PROMPT_CHARS);
  }

  private resolveSize(request: ModelRequest) {
    const raw = (request.parameters?.providerOptions as Record<string, unknown> | undefined)?.size;
    return typeof raw === "string" && /^\d{3,4}x\d{3,4}$/.test(raw) ? raw : DEFAULT_IMAGE_SIZE;
  }

  private async submit(apiKey: string, prompt: string, size: string) {
    const response = await fetch(new URL("v1/images/generations", this.baseUrl()), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
        // 异步模式：立即返回 task_id，避免长连接被网关掐断。
        "X-ModelScope-Async-Mode": "true",
      },
      body: JSON.stringify({ model: this.config.model, prompt, size }),
      signal: AbortSignal.timeout(this.config.timeoutMs),
    });
    if (!response.ok) throw new Error(`模型接口返回 HTTP ${response.status}`);
    const body = await response.json() as { task_id?: string; task_status?: string; message?: string };
    if (!body.task_id) throw new Error(`模型接口未返回任务号${body.message ? `：${body.message}` : ""}`);
    return body.task_id;
  }

  private async waitForImage(apiKey: string, taskId: string, deadline: number) {
    let lastStatus = "UNKNOWN";
    while (Date.now() < deadline) {
      const response = await fetch(new URL(`v1/tasks/${encodeURIComponent(taskId)}`, this.baseUrl()), {
        headers: { authorization: `Bearer ${apiKey}`, "X-ModelScope-Task-Type": "image_generation" },
        signal: AbortSignal.timeout(Math.max(5000, deadline - Date.now())),
      });
      if (!response.ok) throw new Error(`模型接口返回 HTTP ${response.status}`);
      const body = await response.json() as { task_status?: string; output_images?: string[]; message?: string };
      lastStatus = body.task_status ?? "UNKNOWN";
      if (lastStatus === "SUCCEED") {
        const url = body.output_images?.[0];
        if (!url) throw new Error("模型任务成功但没有返回图片");
        return url;
      }
      if (lastStatus === "FAILED") throw new Error(`模型生成失败${body.message ? `：${body.message}` : ""}`);
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
    throw new Error(`图像生成超时（最后状态 ${lastStatus}）`);
  }

  private baseUrl() {
    return this.config.baseUrl.endsWith("/") ? this.config.baseUrl : `${this.config.baseUrl}/`;
  }
}

function safeJoin(root: string, storageKey: string) {
  const target = path.resolve(root, storageKey);
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) throw new Error("非法文件路径");
  return target;
}

function normalizeImageMime(header: string | null, url: string) {
  const declared = header?.split(";")[0]?.trim().toLowerCase();
  if (declared?.startsWith("image/")) return declared;
  if (/\.jpe?g(\?|$)/i.test(url)) return "image/jpeg";
  if (/\.webp(\?|$)/i.test(url)) return "image/webp";
  return "image/png";
}

function extensionFor(mimeType: string) {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/webp") return "webp";
  return "png";
}

function safeFileStem(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, "-").slice(0, 60) || "artedu-image";
}
