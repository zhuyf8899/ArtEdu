import assert from "node:assert/strict";
import test from "node:test";
import { runModelLoop } from "./agent-runtime";
import type { ModelAdapter } from "../generation/model-adapter";

test("模型循环会把 tool 结果回传并继续到最终文本", async () => {
  let calls = 0;
  const adapter: ModelAdapter = {
    id: "test-loop",
    capabilities: ["chat"],
    async execute(request) {
      calls += 1;
      if (calls < 3) {
        return { kind: "text", content: "", toolCalls: [{ id: `call-${calls}`, type: "function", function: { name: "lookup", arguments: JSON.stringify({ round: calls }) } }] };
      }
      return { kind: "text", content: `done:${request.messages?.filter((message) => message.role === "tool").length}` };
    },
  };

  const result = await runModelLoop({
    adapter,
    request: { jobType: "chat", prompt: "开始" },
    tools: [{ type: "function", function: { name: "lookup", parameters: { type: "object" } } }],
    executeTool: { execute: async (call) => ({ ok: true, args: JSON.parse(call.function.arguments) }) },
    maxRounds: 3,
  });

  assert.equal(result.content, "done:2");
  assert.equal(result.rounds, 3);
  assert.equal(result.toolCallCount, 2);
  assert.equal(result.messages.filter((message) => message.role === "tool").length, 2);
});

test("模型循环达到上限时停止，避免无限调用", async () => {
  const adapter: ModelAdapter = {
    id: "test-loop-limit",
    capabilities: ["chat"],
    async execute() {
      return { kind: "text", content: "", toolCalls: [{ id: "loop", type: "function", function: { name: "lookup", arguments: "{}" } }] };
    },
  };

  await assert.rejects(
    runModelLoop({
      adapter,
      request: { jobType: "chat", prompt: "循环" },
      tools: [{ type: "function", function: { name: "lookup", parameters: { type: "object" } } }],
      executeTool: { execute: async () => ({ ok: true }) },
      maxRounds: 2,
    }),
    /超过最大轮数/,
  );
});
