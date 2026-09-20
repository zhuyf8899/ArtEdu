import { randomUUID } from "node:crypto";
import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { getEnvironment } from "../../common/environment";
import type { ModelAdapter, ModelProviderConfig, ModelRequest, ModelResult } from "./model-adapter";
import { describeProviderApiKeyEnvs, resolveProviderApiKeys } from "./provider-api-keys";

/**
 * OpenAI Images 兼容协议适配器。
 * 它只在服务器保存 API key，浏览器永远只请求 ArtEdu 的 generation-jobs 接口。
 * 兼容返回 url 或 b64_json 的常见图片 API；供应商差异被限制在此文件内。
 */
export class OpenAIImageAdapter implements ModelAdapter {
  constructor(private readonly config: ModelProviderConfig) {}

  get id() { return this.config.id; }
  get capabilities() { return this.config.capabilities; }

  async execute(request: ModelRequest): Promise<ModelResult> {
    if (!this.config.capabilities.includes(request.jobType)) throw new Error(`模型 ${this.id} 不支持任务类型 ${request.jobType}`);
    const [apiKey] = resolveProviderApiKeys(this.config);
    if (!apiKey) throw new Error(`模型 ${this.id} 未配置环境变量 ${describeProviderApiKeyEnvs(this.config)}`);
    const prompt = this.prompt(request);
    const options = (request.parameters?.providerOptions ?? {}) as Record<string, unknown>;
    const response = await fetch(new URL("images/generations", this.baseUrl()), {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: this.config.model,
        prompt,
        size: imageSize(options),
        n: typeof options.imageCount === "number" ? options.imageCount : 1,
        ...(typeof options.seed === "number" ? { seed: options.seed } : {}),
        ...(typeof options.style === "string" ? { style: options.style } : {}),
      }),
      signal: request.signal ?? AbortSignal.timeout(this.config.timeoutMs),
    });
    if (!response.ok) throw new Error(`模型接口返回 HTTP ${response.status}`);
    const body = await response.json() as { data?: Array<{ url?: string; b64_json?: string; revised_prompt?: string }> };
    const image = body.data?.[0];
    if (!image?.url && !image?.b64_json) throw new Error("图片接口没有返回可下载产物");
    const { bytes, mimeType } = image.b64_json
      ? { bytes: Buffer.from(image.b64_json, "base64"), mimeType: "image/png" }
      : await downloadImage(image.url!, this.config.timeoutMs);
    if (bytes.length === 0) throw new Error("图片接口返回空文件");
    const jobId = request.jobId ?? randomUUID();
    const storageKey = path.posix.join("generated", jobId, `${randomUUID()}.${extensionFor(mimeType)}`);
    const target = safeJoin(path.resolve(getEnvironment().uploadRoot), storageKey);
    await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
    await writeFile(target, bytes, { mode: 0o600 });
    const file = await stat(target);
    return {
      kind: "asset", content: storageKey, mimeType,
      metadata: {
        providerId: this.id, model: this.config.model, fileName: `artedu-image-${jobId.slice(0, 8)}.${extensionFor(mimeType)}`,
        fileSize: file.size, revisedPrompt: image.revised_prompt, inputTokens: 0, outputTokens: 0,
      },
    };
  }

  private prompt(request: ModelRequest) {
    const message = [...(request.messages ?? [])].reverse().find((item) => item.role === "user")?.content;
    const prompt = (message ?? request.prompt ?? "").replace(/\s+/g, " ").trim();
    if (!prompt) throw new Error("图像生成至少需要一段提示词");
    return prompt.slice(0, 1500);
  }

  private baseUrl() { return this.config.baseUrl.endsWith("/") ? this.config.baseUrl : `${this.config.baseUrl}/`; }
}

async function downloadImage(url: string, timeoutMs: number) {
  // 只允许 https 成品地址，避免上游返回内网 URL 时触发 SSRF。
  if (new URL(url).protocol !== "https:") throw new Error("图片供应商返回了不安全的下载地址");
  const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new Error(`下载生成图片失败 HTTP ${response.status}`);
  const type = response.headers.get("content-type")?.split(";")[0]?.toLowerCase();
  return { bytes: Buffer.from(await response.arrayBuffer()), mimeType: type?.startsWith("image/") ? type : "image/png" };
}

function imageSize(options: Record<string, unknown>) {
  if (typeof options.size === "string" && /^\d{3,4}x\d{3,4}$/.test(options.size)) return options.size;
  return ({ "1:1": "1024x1024", "4:3": "1024x768", "3:4": "768x1024", "16:9": "1536x864", "9:16": "864x1536" } as Record<string, string>)[String(options.aspectRatio)] ?? "1024x1024";
}

function safeJoin(root: string, storageKey: string) {
  const target = path.resolve(root, storageKey);
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) throw new Error("非法文件路径");
  return target;
}

function extensionFor(mimeType: string) {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/webp") return "webp";
  return "png";
}
