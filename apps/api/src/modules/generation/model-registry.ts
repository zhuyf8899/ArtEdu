import { Injectable } from "@nestjs/common";
import { z } from "zod";
import { ModelScopeImageAdapter } from "./modelscope-image.adapter";
import { ModelHttpError, UNUSABLE_KEY_HTTP_STATUSES, describeProviderApiKeyEnvs, providerApiKeyEnvNames, resolveProviderApiKeys } from "./provider-api-keys";
import type { ModelAdapter, ModelCapability, ModelInvocationOptions, ModelMessage, ModelProviderConfig, ModelRequest, ModelResult, ModelStreamDelta } from "./model-adapter";

const capabilitySchema = z.enum(["chat", "vision", "image", "video", "webpage", "pattern", "document", "knowledge_graph"]);
const providerSchema = z.object({
  id: z.string().trim().min(1).max(80),
  baseUrl: z.string().url(),
  model: z.string().trim().min(1).max(160),
  capabilities: z.array(capabilitySchema).min(1),
  apiKeyEnv: z.string().regex(/^[A-Z][A-Z0-9_]*$/).optional(),
  // 备用 key：主 key 缺失、或主 key 返回 401/402/403（失效/欠费）时自动切换。
  apiKeyFallbackEnv: z.string().regex(/^[A-Z][A-Z0-9_]*$/).optional(),
  // Agent 可经历工具调用和视觉理解；三分钟是单次上游模型调用的硬上限。
  timeoutMs: z.coerce.number().int().min(1000).max(180000).default(30000),
  // 默认沿用 OpenAI 兼容的 chat/completions；图像等专用协议在此显式声明。
  protocol: z.enum(["openai-chat", "modelscope-image"]).default("openai-chat"),
  // 内部通道（如平台内置图像生成）：只用于后端路由，不出现在前台模型列表。
  internal: z.boolean().default(false),
});

export function readModelProviderConfigs(raw = process.env.MODEL_PROVIDERS_JSON): ModelProviderConfig[] {
  if (!raw?.trim()) return [];
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error("MODEL_PROVIDERS_JSON 必须是合法 JSON 数组");
  }
  const configs = z.array(providerSchema).parse(value);
  if ((process.env.NODE_ENV ?? "development") === "production") {
    for (const config of configs) {
      const url = new URL(config.baseUrl);
      if (url.protocol !== "https:" || url.username || url.password) {
        throw new Error(`生产环境模型地址必须使用无凭据 HTTPS: ${config.id}`);
      }
    }
  }
  return configs;
}

function toMessages(request: ModelRequest): ModelMessage[] {
  if (request.messages?.length) return request.messages;
  if (request.prompt?.trim()) return [{ role: "user", content: request.prompt }];
  throw new Error("模型调用至少需要一条消息或 prompt");
}

function toOpenAiMessages(request: ModelRequest) {
  return toMessages(request).map((message) => ({
    role: message.role,
    // DeepSeek/OpenAI-compatible视觉模型要求图片作为 user content 的 image_url 分段，
    // 不能把私有站内 URL 当作普通文字或让模型自行携带登录态去下载。
    content: message.role === "user" && message.images?.length
      ? [
        { type: "text", text: message.content },
        ...message.images.map((image) => ({ type: "image_url", image_url: { url: image.dataUrl, ...(image.detail ? { detail: image.detail } : {}) } })),
      ]
      : message.content,
    ...(message.name === undefined ? {} : { name: message.name }),
    ...(message.toolCallId === undefined ? {} : { tool_call_id: message.toolCallId }),
    ...(message.toolCalls === undefined ? {} : { tool_calls: message.toolCalls }),
  }));
}

function toOpenAiParameters(options: ModelInvocationOptions = {}) {
  if (options.stream) throw new Error("当前基础 Harness 尚未实现流式响应持久化；请使用 stream=false");
  const { topP, maxTokens, responseFormat, toolChoice, providerOptions = {}, metadata, ...rest } = options;
  const reserved = new Set(["model", "messages", "stream", "temperature", "top_p", "max_tokens", "response_format", "tools", "tool_choice"]);
  const safeProviderOptions = Object.fromEntries(Object.entries(providerOptions).filter(([key]) => !reserved.has(key)));
  return {
    ...safeProviderOptions,
    ...rest,
    ...(topP === undefined ? {} : { top_p: topP }),
    ...(maxTokens === undefined ? {} : { max_tokens: maxTokens }),
    ...(responseFormat === undefined || responseFormat === "text" ? {} : { response_format: { type: responseFormat } }),
    ...(toolChoice === undefined ? {} : { tool_choice: toolChoice }),
    ...(metadata === undefined ? {} : { metadata }),
    stream: false,
  };
}

type OpenAiToolCall = { id?: string; type?: string; function?: { name?: string; arguments?: string } };
type OpenAiUsage = { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
type OpenAiStreamChunk = {
  choices?: Array<{
    finish_reason?: string;
    delta?: {
      content?: string | null;
      tool_calls?: Array<{ index?: number; id?: string; type?: string; function?: { name?: string; arguments?: string } }>;
    };
  }>;
  usage?: OpenAiUsage;
};

/** 非流式路径的 tool call 校验：宁可报错也不要带着半截调用进模型循环。 */
function parseToolCalls(calls: readonly OpenAiToolCall[]) {
  return calls.map((call) => {
    if (call.type !== "function" || !call.id || !call.function?.name || call.function.arguments === undefined) {
      throw new Error("模型接口返回了无效的 tool call");
    }
    return { id: call.id, type: "function" as const, function: { name: call.function.name, arguments: call.function.arguments } };
  });
}

function usageMetadata(usage: OpenAiUsage | undefined, providerId: string, model: string) {
  return {
    providerId,
    model,
    inputTokens: Number(usage?.prompt_tokens ?? 0),
    outputTokens: Number(usage?.completion_tokens ?? 0),
    totalTokens: Number(usage?.total_tokens ?? 0),
  };
}

class OpenAICompatibleAdapter implements ModelAdapter {
  constructor(private readonly config: ModelProviderConfig) {}

  get id() { return this.config.id; }
  get capabilities() { return this.config.capabilities; }

  async execute(request: ModelRequest): Promise<ModelResult> {
    this.assertSupports(request);
    return this.withApiKey((apiKey) => this.invoke(request, apiKey));
  }

  async executeStream(request: ModelRequest, onDelta: (delta: ModelStreamDelta) => void): Promise<ModelResult> {
    this.assertSupports(request);
    return this.withApiKey((apiKey) => this.invokeStream(request, apiKey, onDelta));
  }

  private assertSupports(request: ModelRequest) {
    if (!this.config.capabilities.includes(request.jobType)) {
      throw new Error(`模型 ${this.config.id} 不支持任务类型 ${request.jobType}`);
    }
  }

  /**
   * 按优先级依次尝试主 key 与备用 key。只有"这把 key 本身不可用"
   * （401 失效 / 402 欠费 / 403 无权限，由 ModelHttpError 标记）才换下一把；
   * 5xx、超时、内容为空等换 key 也救不回来，原样抛出，免得一次调用被放大成两次。
   */
  private async withApiKey<T>(attempt: (apiKey: string) => Promise<T>): Promise<T> {
    const apiKeys = resolveProviderApiKeys(this.config);
    if (apiKeys.length === 0) {
      throw new Error(`模型 ${this.config.id} 未配置环境变量 ${describeProviderApiKeyEnvs(this.config)}`);
    }
    let lastError: unknown;
    for (const [index, apiKey] of apiKeys.entries()) {
      try {
        return await attempt(apiKey);
      } catch (error) {
        lastError = error;
        const status = error instanceof ModelHttpError ? error.status : undefined;
        const hasBackupKey = index < apiKeys.length - 1;
        if (!hasBackupKey || status === undefined || !UNUSABLE_KEY_HTTP_STATUSES.has(status)) throw error;
      }
    }
    throw lastError;
  }

  /** 把适配器自身的超时与外部中断信号（用户暂停输出）合并成一个信号。 */
  private requestSignal(external?: AbortSignal) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error("模型调用超时")), this.config.timeoutMs);
    const forward = () => controller.abort(external?.reason);
    if (external) {
      if (external.aborted) forward();
      else external.addEventListener("abort", forward, { once: true });
    }
    return {
      signal: controller.signal,
      dispose: () => {
        clearTimeout(timer);
        external?.removeEventListener("abort", forward);
      },
    };
  }

  private endpoint() {
    const baseUrl = this.config.baseUrl.endsWith("/") ? this.config.baseUrl : `${this.config.baseUrl}/`;
    return new URL("chat/completions", baseUrl);
  }

  private requestBody(request: ModelRequest, stream: boolean) {
    return JSON.stringify({
      model: this.config.model,
      messages: toOpenAiMessages(request),
      ...toOpenAiParameters(request.parameters),
      // include_usage：流式下 usage 只在最后一帧给出，不带这个参数就拿不到 token 计数。
      ...(stream ? { stream: true, stream_options: { include_usage: true } } : {}),
    });
  }

  private async invoke(request: ModelRequest, apiKey: string): Promise<ModelResult> {
    const { signal, dispose } = this.requestSignal(request.signal);
    try {
      const response = await fetch(this.endpoint(), {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
        body: this.requestBody(request, false),
        signal,
      });
      if (!response.ok) throw new ModelHttpError(response.status, `模型接口返回 HTTP ${response.status}`);
      const body = await response.json() as { choices?: Array<{ finish_reason?: string; message?: { content?: string | null; tool_calls?: OpenAiToolCall[] } }>; usage?: OpenAiUsage };
      const choice = body.choices?.[0];
      const toolCalls = parseToolCalls(choice?.message?.tool_calls ?? []);
      const content = choice?.message?.content ?? "";
      if (!content && toolCalls.length === 0) throw new Error("模型接口返回内容为空");
      return {
        kind: "text",
        content,
        toolCalls: toolCalls.length ? toolCalls : undefined,
        finishReason: choice?.finish_reason,
        metadata: usageMetadata(body.usage, this.id, this.config.model),
      };
    } finally {
      dispose();
    }
  }

  /**
   * 流式调用：逐块读 chat/completions 的 SSE，正文增量立刻回调给上层；
   * tool_calls 会按 index 把分片拼回完整调用。返回的 ModelResult 与非流式
   * 路径**完全同构**，所以上层落库/审计逻辑不需要区分是否流式。
   */
  private async invokeStream(request: ModelRequest, apiKey: string, onDelta: (delta: ModelStreamDelta) => void): Promise<ModelResult> {
    const { signal, dispose } = this.requestSignal(request.signal);
    try {
      const response = await fetch(this.endpoint(), {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}`, accept: "text/event-stream" },
        body: this.requestBody(request, true),
        signal,
      });
      // 状态码校验发生在任何增量之前，所以这里仍可安全切换备用 key。
      if (!response.ok) throw new ModelHttpError(response.status, `模型接口返回 HTTP ${response.status}`);
      if (!response.body) throw new Error("模型接口未返回流式响应体");

      let content = "";
      let finishReason: string | undefined;
      let usage: OpenAiUsage | undefined;
      const toolCallParts = new Map<number, { id: string; name: string; args: string }>();

      const consume = (chunk: OpenAiStreamChunk) => {
        if (chunk.usage) usage = chunk.usage;
        const choice = chunk.choices?.[0];
        if (!choice) return;
        if (choice.finish_reason) finishReason = choice.finish_reason;
        const piece = choice.delta?.content ?? "";
        if (piece) {
          content += piece;
          onDelta({ content: piece });
        }
        for (const [position, part] of (choice.delta?.tool_calls ?? []).entries()) {
          const index = part.index ?? position;
          const current = toolCallParts.get(index) ?? { id: "", name: "", args: "" };
          toolCallParts.set(index, {
            id: part.id ?? current.id,
            name: part.function?.name ?? current.name,
            args: current.args + (part.function?.arguments ?? ""),
          });
        }
      };

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let boundary = buffer.indexOf("\n\n");
        while (boundary !== -1) {
          const frame = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          for (const line of frame.split("\n")) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data:")) continue;
            const payload = trimmed.slice(5).trim();
            if (!payload || payload === "[DONE]") continue;
            try {
              consume(JSON.parse(payload) as OpenAiStreamChunk);
            } catch {
              // 忽略解析不了的心跳/噪声帧：不能因为一行杂音中断整轮生成。
            }
          }
          boundary = buffer.indexOf("\n\n");
        }
      }

      const toolCalls = [...toolCallParts.entries()]
        .sort(([left], [right]) => left - right)
        .map(([index, part]) => ({
          id: part.id || `tool-call-${index}`,
          type: "function" as const,
          function: { name: part.name, arguments: part.args },
        }));
      if (!content && toolCalls.length === 0) throw new Error("模型接口返回内容为空");
      return {
        kind: "text",
        content,
        toolCalls: toolCalls.length ? toolCalls : undefined,
        finishReason,
        metadata: usageMetadata(usage, this.id, this.config.model),
      };
    } finally {
      dispose();
    }
  }
}

@Injectable()
export class ModelRegistry {
  private readonly adapters: ModelAdapter[];
  private readonly configsById: Map<string, ModelProviderConfig>;

  constructor() {
    const configs = readModelProviderConfigs();
    this.configsById = new Map(configs.map((config) => [config.id, config]));
    this.adapters = configs.map((config) => config.protocol === "modelscope-image"
      ? new ModelScopeImageAdapter(config)
      : new OpenAICompatibleAdapter(config));
  }

  list() {
    return this.adapters.map((adapter) => ({
      id: adapter.id,
      capabilities: adapter.capabilities,
      internal: this.configsById.get(adapter.id)?.internal === true,
    }));
  }

  listConfigured() {
    return this.list().filter((adapter) => {
      const config = this.configsById.get(adapter.id);
      if (!config) return false;
      // 主 key 与备用 key 都没配时才从列表里隐藏；任意一把有值就照常列出。
      return providerApiKeyEnvNames(config).length === 0 || resolveProviderApiKeys(config).length > 0;
    });
  }

  getForJob(input: { jobType: ModelCapability; modelConfigId?: string | null; providerId?: string | null }): ModelAdapter {
    const capability = input.jobType;
    const selectedId = input.providerId ?? input.modelConfigId;
    const adapter = this.adapters.find((candidate) =>
      candidate.capabilities.includes(capability) && (!selectedId || candidate.id === selectedId),
    );
    if (!adapter) throw new Error(`没有找到支持 ${capability} 的模型适配器`);
    return adapter;
  }
}
