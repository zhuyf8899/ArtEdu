import "dotenv/config";
import assert from "node:assert/strict";
import { readModelProviderConfigs } from "./model-registry";
import type { ModelAdapter, ModelRequest } from "./model-adapter";
import { runModelLoop } from "../agent/agent-runtime";

class FakeAdapter implements ModelAdapter {
  readonly id = "harness-fake";
  readonly capabilities = ["chat", "image", "video", "webpage", "pattern", "document", "knowledge_graph"] as const;

  async execute(request: ModelRequest) {
    return { kind: request.jobType === "chat" ? "text" as const : "json" as const, content: `harness-ok:${request.jobType}:${request.messages?.[1]?.content ?? request.prompt}` };
  }
}

async function main() {
  const configs = readModelProviderConfigs();
  assert.ok(Array.isArray(configs), "环境变量解析结果必须是数组");
  const adapter = new FakeAdapter();
  for (const jobType of adapter.capabilities) {
    const result = await adapter.execute({ jobType, messages: [{ role: "system", content: "system" }, { role: "user", content: "harness test" }], parameters: { temperature: 0.2, topP: 0.9, maxTokens: 128, seed: 7, responseFormat: "text", metadata: { harness: "true" } } });
    assert.match(result.content, new RegExp(`^harness-ok:${jobType}:`));
  }
  let calls = 0;
  const loopAdapter: ModelAdapter = {
    id: "harness-loop",
    capabilities: ["chat"],
    async execute(request) {
      calls += 1;
      if (calls <= 2) {
        return {
          kind: "text",
          content: "",
          toolCalls: [{ id: `call-${calls}`, type: "function", function: { name: "record_step", arguments: JSON.stringify({ step: calls }) } }],
        };
      }
      return { kind: "text", content: `loop-ok:${request.messages?.filter((message) => message.role === "tool").length ?? 0}` };
    },
  };
  const loopResult = await runModelLoop({
    adapter: loopAdapter,
    request: { jobType: "chat", prompt: "harness loop test" },
    tools: [{ type: "function", function: { name: "record_step", parameters: { type: "object" } } }],
    executeTool: { execute: async (call) => ({ accepted: true, arguments: JSON.parse(call.function.arguments) }) },
    maxRounds: 4,
  });
  assert.equal(loopResult.rounds, 3);
  assert.equal(loopResult.toolCallCount, 2);
  assert.equal(loopResult.content, "loop-ok:2");
  assert.equal(loopResult.messages.filter((message) => message.role === "tool").length, 2);
  console.log(JSON.stringify({ ok: true, configuredProviders: configs.map(({ id, model, capabilities }) => ({ id, model, capabilities })), fakeCapabilities: adapter.capabilities }, null, 2));
}

void main();
