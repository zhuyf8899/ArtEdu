import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { setTimeout as pause } from "node:timers/promises";
import path from "node:path";
import { PNG } from "pngjs";
import { getEnvironment } from "../../common/environment";
import { editPng, imageEditForm, type ImageEditInput } from "./image-edit";
import { downloadGeneratedImage, imageRequest, withImageApiKeys } from "./image-transport";
import type { ModelAdapter, ModelProviderConfig, ModelRequest, ModelResult } from "./model-adapter";
import { describeProviderApiKeyEnvs, resolveProviderApiKeys } from "./provider-api-keys";

/** Browser/OpenAI masks use transparent pixels for editing; Wan requires opaque white. */
export function wanxMaskDataUrl(input: ImageEditInput): string | undefined {
  if (!input.mask) return undefined;
  imageEditForm(input, "validate", "validate");
  const mask = PNG.sync.read(editPng(input.mask.dataUrl).bytes, { skipRescale: false });
  for (let i = 0; i < mask.data.length; i += 4) {
    const value = mask.data[i + 3] < 128 ? 255 : 0;
    mask.data[i] = mask.data[i + 1] = mask.data[i + 2] = value;
    mask.data[i + 3] = 255;
  }
  return `data:image/png;base64,${PNG.sync.write(mask, { colorType: 2 }).toString("base64")}`;
}

type TaskBody = { code?: string; output?: { task_id?: string; task_status?: string; code?: string; results?: Array<{ url?: string }> } };
function taskFailure(body: TaskBody) {
  // Never copy upstream messages, URLs, input images or credentials into audit logs.
  const code = body.output?.code ?? body.code;
  return new Error(`万相图片编辑失败${typeof code === "string" && /^[A-Za-z0-9_.-]{1,80}$/.test(code) ? `（${code}）` : ""}`);
}

/** DashScope image2image is asynchronous, rather than OpenAI multipart images/edits. */
export class WanxImageEditAdapter implements ModelAdapter {
  constructor(private readonly config: ModelProviderConfig) {}
  get id() { return this.config.id; }
  get capabilities() { return this.config.capabilities; }

  async execute(request: ModelRequest): Promise<ModelResult> {
    if (!this.config.capabilities.includes(request.jobType)) throw new Error(`模型 ${this.id} 不支持任务类型 ${request.jobType}`);
    if (!this.config.imageEditing || !request.imageEdit) throw new Error("万相编辑通道需要已授权的原图，不用于文生图");
    imageEditForm(request.imageEdit, this.config.model, "validate");
    const original = editPng(request.imageEdit.image.dataUrl);
    if (original.width < 512 || original.height < 512 || original.width > 4096 || original.height > 4096) throw new Error("万相编辑原图宽高需在 512 至 4096 像素之间");
    // Decode before incurring API usage; reject corrupt PNGs even when their headers look valid.
    PNG.sync.read(original.bytes);
    const prompt = ([...(request.messages ?? [])].reverse().find(m => m.role === "user")?.content ?? request.prompt ?? "").trim();
    if (!prompt) throw new Error("图片编辑需要提示词");
    if (Array.from(prompt).length > 800) throw new Error("万相图片编辑提示词不能超过 800 字");
    const mask = wanxMaskDataUrl(request.imageEdit);
    const keys = resolveProviderApiKeys(this.config);
    if (!keys.length) throw new Error(`模型 ${this.id} 未配置环境变量 ${describeProviderApiKeyEnvs(this.config)}`);
    const base = this.config.baseUrl.replace(/\/?$/, "/");
    const signal = request.signal ? AbortSignal.any([request.signal, AbortSignal.timeout(this.config.timeoutMs)]) : AbortSignal.timeout(this.config.timeoutMs);
    const deadline = Date.now() + this.config.timeoutMs;
    const remaining = () => Math.max(1, deadline - Date.now());
    const submitted = await withImageApiKeys(keys, async key => {
      const body = await imageRequest(new URL("services/aigc/image2image/image-synthesis", base), {
        method: "POST", signal,
        headers: { "content-type": "application/json", authorization: `Bearer ${key}`, "X-DashScope-Async": "enable" },
        body: JSON.stringify({ model: this.config.model, input: {
          function: mask ? "description_edit_with_mask" : "description_edit", prompt,
          base_image_url: request.imageEdit!.image.dataUrl, ...(mask ? { mask_image_url: mask } : {}),
        }, parameters: { n: 1, watermark: false } }),
      }, { stage: "submit", timeoutMs: remaining(), signal }, response => response.json() as Promise<TaskBody>);
      if (!body.output?.task_id) throw taskFailure(body);
      return { key, taskId: body.output.task_id };
    });
    let imageUrl: string | undefined;
    while (Date.now() < deadline) {
      signal.throwIfAborted();
      const body = await imageRequest(new URL(`tasks/${encodeURIComponent(submitted.taskId)}`, base), {
        headers: { authorization: `Bearer ${submitted.key}` },
      }, { stage: "poll", timeoutMs: remaining(), signal }, response => response.json() as Promise<TaskBody>);
      if (body.output?.task_status === "SUCCEEDED") { imageUrl = body.output.results?.[0]?.url; break; }
      if (!["PENDING", "RUNNING"].includes(body.output?.task_status ?? "")) throw taskFailure(body);
      await pause(Math.min(2000, remaining()), undefined, { signal });
    }
    if (!imageUrl) throw new Error("万相编辑未返回图片，或等待结果超时；不会自动重新提交任务");
    const { bytes, mimeType } = await downloadGeneratedImage(imageUrl, remaining(), signal);
    if (bytes.length > 8 * 1024 * 1024) throw new Error("万相编辑成果超过 8 MiB");
    const extension = mimeType === "image/jpeg" ? "jpg" : mimeType === "image/webp" ? "webp" : "png";
    const metadata = { providerId: this.id, model: this.config.model, fileName: `workflow-edit.${extension}`, fileSize: bytes.length, inputTokens: 0, outputTokens: 0 };
    if (request.transient) return { kind: "asset", content: "memory", mimeType, metadata: { ...metadata, bytes } };
    const storageKey = path.posix.join("generated", randomUUID(), `${randomUUID()}.${extension}`);
    const target = path.resolve(getEnvironment().uploadRoot, storageKey);
    await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
    await writeFile(target, bytes, { mode: 0o600 });
    return { kind: "asset", content: storageKey, mimeType, metadata };
  }
}
