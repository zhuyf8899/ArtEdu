export type ModelCapability =
  | "chat"
  | "image"
  | "video"
  | "webpage"
  | "pattern"
  | "document"
  | "knowledge_graph";

export type ModelMessageRole = "system" | "user" | "assistant" | "tool";

export interface ModelMessage {
  role: ModelMessageRole;
  content: string;
  name?: string;
  toolCallId?: string;
  toolCalls?: ModelToolCall[];
}

export interface ModelToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface ModelToolDefinition {
  type: "function";
  function: { name: string; description?: string; parameters: Record<string, unknown> };
}

/** Provider-neutral fields. Provider-specific options cannot override the selected model or messages. */
export interface ModelInvocationOptions {
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  presencePenalty?: number;
  frequencyPenalty?: number;
  seed?: number;
  stop?: string[];
  responseFormat?: "text" | "json_object";
  stream?: boolean;
  tools?: ModelToolDefinition[];
  toolChoice?: "auto" | "none" | { type: "function"; function: { name: string } };
  metadata?: Record<string, string>;
  providerOptions?: Record<string, unknown>;
}

export interface ModelRequest {
  jobType: ModelCapability;
  /** Compatibility field for queued generation jobs. New callers should use messages. */
  prompt?: string;
  messages?: ModelMessage[];
  parameters?: ModelInvocationOptions;
  modelConfigId?: string | null;
  providerId?: string | null;
  /** 生成任务 id：产物类适配器（图像/视频）据此把文件写进上传目录。 */
  jobId?: string;
  /** 外部中断信号（用户暂停输出）。适配器会把它和自身超时合并。 */
  signal?: AbortSignal;
}

export interface ModelResult {
  kind: "text" | "asset" | "json";
  content: string;
  mimeType?: string;
  metadata?: Record<string, unknown>;
  toolCalls?: ModelToolCall[];
  finishReason?: string;
}

export interface ModelAdapter {
  readonly id: string;
  readonly capabilities: readonly ModelCapability[];
  execute(request: ModelRequest): Promise<ModelResult>;
  /**
   * 可选的流式调用：正文增量经 onDelta 实时回调，**返回值与 execute 完全一致**
   * （同样的 content / toolCalls / metadata），所以调用方的落库与审计逻辑
   * 不需要区分流式与否。
   * 未实现的适配器不提供此方法，调用方自动退回 execute。
   */
  executeStream?(request: ModelRequest, onDelta: (delta: ModelStreamDelta) => void): Promise<ModelResult>;
}

/** 流式增量：目前只承载正文片段（工具调用在内部累积，最终随 ModelResult 一并返回）。 */
export interface ModelStreamDelta {
  content: string;
}

/**
 * 供应商协议。默认 openai-chat（chat/completions）；
 * 图像/视频等不兼容 OpenAI 文本协议的供应商使用各自的专用适配器。
 */
export type ModelProtocol = "openai-chat" | "modelscope-image";

export interface ModelProviderConfig {
  id: string;
  baseUrl: string;
  model: string;
  capabilities: ModelCapability[];
  apiKeyEnv?: string;
  /**
   * 备用 key 的环境变量名。主 key 缺失，或主 key 被判为不可用
   * （鉴权失败 401 / 余额不足 402 / 无权限 403）时自动切换过来。
   */
  apiKeyFallbackEnv?: string;
  timeoutMs: number;
  protocol?: ModelProtocol;
  /**
   * 内部通道：只服务后端按能力路由（例如图像生成），
   * 不进入前台的模型选择列表。前台不感知它，也不需要选它。
   */
  internal?: boolean;
}
