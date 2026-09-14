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

// ── 流式：onDelta ──────────────────────────────────────────────────────
test("提供 onDelta 且适配器支持流式时走 executeStream，增量实时回调", async () => {
  const adapter: ModelAdapter = {
    id: "test-loop-stream",
    capabilities: ["chat"],
    async execute() {
      throw new Error("提供了 onDelta 就不该再走一次性调用");
    },
    async executeStream(_request, onDelta) {
      for (const piece of ["这是", "流式", "输出。"]) onDelta({ content: piece });
      return { kind: "text", content: "这是流式输出。" };
    },
  };

  const deltas: string[] = [];
  const result = await runModelLoop({
    adapter,
    request: { jobType: "chat", prompt: "开始" },
    onDelta: (delta) => deltas.push(delta.content),
  });

  assert.deepEqual(deltas, ["这是", "流式", "输出。"]);
  assert.equal(result.content, "这是流式输出。");
  assert.equal(result.rounds, 1);
});

test("适配器不支持流式时自动退回一次性调用，不影响结果", async () => {
  const adapter: ModelAdapter = {
    id: "test-loop-no-stream",
    capabilities: ["chat"],
    async execute() {
      return { kind: "text", content: "一次性结果" };
    },
  };

  const deltas: string[] = [];
  const result = await runModelLoop({
    adapter,
    request: { jobType: "chat", prompt: "x" },
    onDelta: (delta) => deltas.push(delta.content),
  });

  assert.equal(result.content, "一次性结果");
  assert.deepEqual(deltas, []);
});

test("流式下的多轮工具调用：每一轮的增量都被转发", async () => {
  let calls = 0;
  const adapter: ModelAdapter = {
    id: "test-loop-stream-tools",
    capabilities: ["chat"],
    async execute() {
      throw new Error("应走流式");
    },
    async executeStream(_request, onDelta) {
      calls += 1;
      if (calls === 1) {
        onDelta({ content: "先查一下。" });
        return { kind: "text", content: "先查一下。", toolCalls: [{ id: "call-1", type: "function", function: { name: "lookup", arguments: "{}" } }] };
      }
      onDelta({ content: "答案是 42。" });
      return { kind: "text", content: "答案是 42。" };
    },
  };

  const deltas: string[] = [];
  const result = await runModelLoop({
    adapter,
    request: { jobType: "chat", prompt: "开始" },
    tools: [{ type: "function", function: { name: "lookup", parameters: { type: "object" } } }],
    executeTool: { execute: async () => ({ ok: true }) },
    onDelta: (delta) => deltas.push(delta.content),
  });

  assert.deepEqual(deltas, ["先查一下。", "答案是 42。"]);
  assert.equal(result.content, "答案是 42。");
  assert.equal(result.rounds, 2);
  assert.equal(result.toolCallCount, 1);
});
