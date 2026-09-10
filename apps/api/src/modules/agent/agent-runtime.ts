import type { ModelAdapter, ModelMessage, ModelRequest, ModelResult, ModelToolCall, ModelToolDefinition } from "../generation/model-adapter";

export interface AgentToolContext {
  round: number;
  request: ModelRequest;
  messages: readonly ModelMessage[];
}

export interface AgentToolExecutor {
  execute(call: ModelToolCall, context: AgentToolContext): Promise<unknown>;
}

export interface ModelLoopOptions {
  adapter: ModelAdapter;
  request: ModelRequest;
  tools?: readonly ModelToolDefinition[];
  executeTool?: AgentToolExecutor;
  maxRounds?: number;
}

export interface ModelLoopResult extends ModelResult {
  rounds: number;
  messages: ModelMessage[];
  toolCallCount: number;
}

/**
 * Runs the provider-neutral model/tool loop. No business tools belong here;
 * callers provide an executor after applying their own authorization rules.
 */
export async function runModelLoop(options: ModelLoopOptions): Promise<ModelLoopResult> {
  const maxRounds = options.maxRounds ?? 8;
  if (!Number.isInteger(maxRounds) || maxRounds < 1 || maxRounds > 32) {
    throw new Error("模型循环轮数必须在 1 到 32 之间");
  }

  const definitions = [...(options.tools ?? options.request.parameters?.tools ?? [])];
  const definitionsByName = new Map(definitions.map((tool) => [tool.function.name, tool]));
  const messages = [...(options.request.messages ?? (options.request.prompt ? [{ role: "user" as const, content: options.request.prompt }] : []))];
  if (!messages.length) throw new Error("模型调用至少需要一条消息或 prompt");
  let toolCallCount = 0;

  for (let round = 1; round <= maxRounds; round += 1) {
    const result = await options.adapter.execute({
      ...options.request,
      messages,
      parameters: { ...options.request.parameters, ...(definitions.length ? { tools: definitions } : {}) },
    });
    const toolCalls = result.toolCalls ?? [];
    if (!toolCalls.length) return { ...result, rounds: round, messages, toolCallCount };
    if (!options.executeTool) throw new Error("模型返回 tool call，但未提供工具执行器");

    messages.push({ role: "assistant", content: result.content, toolCalls });
    for (const call of toolCalls) {
      const definition = definitionsByName.get(call.function.name);
      if (!definition) throw new Error(`模型请求了未注册的工具: ${call.function.name}`);
      let output: unknown;
      try {
        output = await options.executeTool.execute(call, { round, request: options.request, messages: [...messages] });
      } catch (error) {
        output = { error: error instanceof Error ? error.message : "工具执行失败" };
      }
      messages.push({
        role: "tool",
        name: call.function.name,
        toolCallId: call.id,
        content: JSON.stringify(output),
      });
      toolCallCount += 1;
    }
  }

  throw new Error(`模型循环超过最大轮数（${maxRounds}）`);
}
