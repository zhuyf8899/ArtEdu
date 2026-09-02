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
}

export interface ModelResult {
  kind: "text" | "asset" | "json";
  content: string;
  mimeType?: string;
  metadata?: Record<string, unknown>;
}

export interface ModelAdapter {
  readonly id: string;
  readonly capabilities: readonly ModelCapability[];
  execute(request: ModelRequest): Promise<ModelResult>;
}

export interface ModelProviderConfig {
  id: string;
  baseUrl: string;
  model: string;
  capabilities: ModelCapability[];
  apiKeyEnv?: string;
  timeoutMs: number;
}
