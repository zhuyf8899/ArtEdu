import { Injectable } from "@nestjs/common";
import { z } from "zod";
import { ModelScopeImageAdapter } from "./modelscope-image.adapter";
import type { ModelAdapter, ModelCapability, ModelInvocationOptions, ModelMessage, ModelProviderConfig, ModelRequest, ModelResult } from "./model-adapter";

const capabilitySchema = z.enum(["chat", "image", "video", "webpage", "pattern", "document", "knowledge_graph"]);
const providerSchema = z.object({
  id: z.string().trim().min(1).max(80),
  baseUrl: z.string().url(),
  model: z.string().trim().min(1).max(160),
  capabilities: z.array(capabilitySchema).min(1),
  apiKeyEnv: z.string().regex(/^[A-Z][A-Z0-9_]*$/).optional(),
  timeoutMs: z.coerce.number().int().min(1000).max(120000).default(30000),
  // 默认沿用 OpenAI 兼容的 chat/completions；图像等专用协议在此显式声明。
  protocol: z.enum(["openai-chat", "modelscope-image"]).default("openai-chat"),
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
    content: message.content,
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

class OpenAICompatibleAdapter implements ModelAdapter {
  constructor(private readonly config: ModelProviderConfig) {}

  get id() { return this.config.id; }
  get capabilities() { return this.config.capabilities; }

  async execute(request: ModelRequest): Promise<ModelResult> {
    if (!this.config.capabilities.includes(request.jobType)) {
      throw new Error(`模型 ${this.config.id} 不支持任务类型 ${request.jobType}`);
    }

    const apiKey = this.config.apiKeyEnv ? process.env[this.config.apiKeyEnv] : undefined;
    if (!apiKey) throw new Error(`模型 ${this.config.id} 未配置环境变量 ${this.config.apiKeyEnv ?? "API key"}`);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);
    try {
      const baseUrl = this.config.baseUrl.endsWith("/") ? this.config.baseUrl : `${this.config.baseUrl}/`;
      const response = await fetch(new URL("chat/completions", baseUrl), {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model: this.config.model, messages: toOpenAiMessages(request), ...toOpenAiParameters(request.parameters) }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`模型接口返回 HTTP ${response.status}`);
      const body = await response.json() as {
        choices?: Array<{ finish_reason?: string; message?: { content?: string | null; tool_calls?: Array<{ id?: string; type?: string; function?: { name?: string; arguments?: string } }> } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
      };
      const choice = body.choices?.[0];
      const toolCalls = (choice?.message?.tool_calls ?? []).map((call) => {
        if (call.type !== "function" || !call.id || !call.function?.name || call.function.arguments === undefined) {
          throw new Error("模型接口返回了无效的 tool call");
        }
        return { id: call.id, type: "function" as const, function: { name: call.function.name, arguments: call.function.arguments } };
      });
      const content = choice?.message?.content ?? "";
      if (!content && toolCalls.length === 0) throw new Error("模型接口返回内容为空");
      return {
        kind: "text",
        content,
        toolCalls: toolCalls.length ? toolCalls : undefined,
        finishReason: choice?.finish_reason,
        metadata: {
          providerId: this.id,
          model: this.config.model,
          inputTokens: Number(body.usage?.prompt_tokens ?? 0),
          outputTokens: Number(body.usage?.completion_tokens ?? 0),
          totalTokens: Number(body.usage?.total_tokens ?? 0),
        },
      };
    } finally {
      clearTimeout(timer);
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
    return this.adapters.map((adapter) => ({ id: adapter.id, capabilities: adapter.capabilities }));
  }

  listConfigured() {
    return this.list().filter((adapter) => {
      const apiKeyEnv = this.configsById.get(adapter.id)?.apiKeyEnv;
      return !apiKeyEnv || Boolean(process.env[apiKeyEnv]?.trim());
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
