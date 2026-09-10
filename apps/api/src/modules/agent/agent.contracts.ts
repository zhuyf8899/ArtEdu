import { z } from "zod";

export const agentScenarioSchema = z.enum(["ui_design", "webpage_generation", "pattern_generation"]);
export const createAgentRunSchema = z.object({
  scenario: agentScenarioSchema,
  prompt: z.string().trim().min(1, "创作需求不能为空").max(10000),
  parameters: z.record(z.string(), z.unknown()).default({}),
});

const modelMessageSchema = z.object({
  role: z.enum(["system", "user", "assistant", "tool"]),
  content: z.string().trim().min(1).max(20000),
  name: z.string().trim().min(1).max(80).optional(),
  toolCallId: z.string().trim().min(1).max(160).optional(),
});

const modelToolSchema = z.object({
  type: z.literal("function"),
  function: z.object({
    name: z.string().trim().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,79}$/),
    description: z.string().trim().max(1000).optional(),
    parameters: z.record(z.string(), z.unknown()),
  }),
});

const providerOptionsSchema = z.record(z.string().min(1).max(80), z.unknown()).refine(
  (value) => Object.keys(value).length <= 30,
  "providerOptions 最多允许 30 项",
);

export const modelInvocationOptionsSchema = z.object({
  temperature: z.number().min(0).max(2).optional(),
  topP: z.number().min(0).max(1).optional(),
  maxTokens: z.number().int().min(1).max(32768).optional(),
  presencePenalty: z.number().min(-2).max(2).optional(),
  frequencyPenalty: z.number().min(-2).max(2).optional(),
  seed: z.number().int().min(0).max(2147483647).optional(),
  stop: z.array(z.string().min(1).max(120)).max(4).optional(),
  responseFormat: z.enum(["text", "json_object"]).optional(),
  stream: z.literal(false).optional(),
  tools: z.array(modelToolSchema).max(16).optional(),
  toolChoice: z.union([z.enum(["auto", "none"]), z.object({ type: z.literal("function"), function: z.object({ name: z.string().trim().min(1).max(80) }) })]).optional(),
  metadata: z.record(z.string().min(1).max(80), z.string().max(500)).refine((value) => Object.keys(value).length <= 16, "metadata 最多允许 16 项").optional(),
  providerOptions: providerOptionsSchema.optional(),
});

export const executeAgentRunSchema = z.object({
  /** local 仅向已配对的本地 Bridge 派发任务；server 使用服务端已配置的模型 provider。 */
  mode: z.enum(["mock", "local", "server"]).default("local"),
  providerId: z.string().trim().min(1).max(80).optional(),
  /** 仅在用户明确开启时向模型提供平台搜索工具。 */
  searchEnabled: z.boolean().default(false),
  systemPrompt: z.string().trim().max(8000).optional(),
  context: z.array(modelMessageSchema).max(30).default([]),
  model: modelInvocationOptionsSchema.default({}),
});

export type AgentScenario = z.infer<typeof agentScenarioSchema>;
export type CreateAgentRunInput = z.infer<typeof createAgentRunSchema>;
export type ExecuteAgentRunInput = z.infer<typeof executeAgentRunSchema>;
