// 回归护栏：Agent 输出时前端发卡的两个来源——逐帧 setState 重渲染整段对话、
// 以及历史回复的 Markdown 被反复解析。这里既测合帧逻辑，也盯住两处接线。
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createDeltaBuffer } from "../src/chatStream.js";

function manualScheduler() {
  const queue = [];
  return {
    queue,
    schedule: (run) => { queue.push(run); return queue.length - 1; },
    cancel: (handle) => { queue[handle] = null; },
    run() { const tasks = queue.splice(0, queue.length); for (const task of tasks) task?.(); },
  };
}

test("同一帧内的多个增量只交付一次，且一个字都不丢", () => {
  const flushed = [];
  const scheduler = manualScheduler();
  const buffer = createDeltaBuffer({ onFlush: (text) => flushed.push(text), scheduler });

  buffer.push("设计说明");
  buffer.push("：先分层");
  buffer.push("，再配色。");
  assert.deepEqual(flushed, [], "还没到帧时间就不该渲染");
  assert.equal(buffer.pending, "设计说明：先分层，再配色。");

  scheduler.run();
  assert.deepEqual(flushed, ["设计说明：先分层，再配色。"], "一帧只渲染一次");
  assert.equal(buffer.pending, "");

  buffer.push("继续输出");
  scheduler.run();
  assert.deepEqual(flushed, ["设计说明：先分层，再配色。", "继续输出"]);
});

test("暂停/收尾时能把缓冲区里剩下的正文取出来", () => {
  const flushed = [];
  const scheduler = manualScheduler();
  const buffer = createDeltaBuffer({ onFlush: (text) => flushed.push(text), scheduler });

  buffer.push("已经写了一半");
  buffer.cancelFrame();
  scheduler.run();
  assert.deepEqual(flushed, [], "取消排队后不能自己渲染");
  buffer.flush();
  assert.deepEqual(flushed, ["已经写了一半"], "flush 必须把剩下的正文交出去");

  buffer.push("最后一段");
  assert.equal(buffer.take(), "最后一段", "take 取走内容且不触发回调");
  assert.equal(buffer.take(), "");
  assert.deepEqual(flushed.length, 1);
});

test("空增量不触发渲染", () => {
  const flushed = [];
  const scheduler = manualScheduler();
  const buffer = createDeltaBuffer({ onFlush: (text) => flushed.push(text), scheduler });
  buffer.push("");
  buffer.push(undefined);
  scheduler.run();
  assert.deepEqual(flushed, []);
});

test("创作页用合帧缓冲渲染增量，并把历史消息与 Markdown 渲染 memo 化", async () => {
  const source = await readFile(new URL("../src/CreationWorkspace.jsx", import.meta.url), "utf8");
  const markdown = await readFile(new URL("../src/AiMarkdown.js", import.meta.url), "utf8");

  // 增量必须先进缓冲，收尾/暂停时再把剩余部分交出去。
  assert.ok(source.includes("const deltaBuffer = createDeltaBuffer({"));
  assert.ok(source.includes("const onDelta = (text) => { deltaBuffer.push(text); };"));
  assert.ok(source.includes("deltaBuffer.flush();"));
  assert.ok(source.includes("deltaBuffer.cancelFrame();"));
  // 每条消息是 memo 组件：只有正文变化的那一条会重渲染。
  assert.ok(source.includes("const ChatMessage = memo(function ChatMessage("));
  assert.ok(source.includes("<ChatMessage"));
  // 流式渲染的 Markdown 组件本身也要 memo，否则历史正文每帧重解析。
  assert.ok(markdown.includes("memo(function AiMarkdown"));
  assert.ok(markdown.includes("import { createElement as h, memo } from \"react\";"));
});

test("滚动跟随输出，但用户往回翻看时不抢滚动", async () => {
  const source = await readFile(new URL("../src/CreationWorkspace.jsx", import.meta.url), "utf8");
  assert.ok(source.includes("const streamingLength = messages[messages.length - 1]?.content?.length ?? 0;"));
  assert.ok(source.includes("if (node.scrollHeight - node.scrollTop - node.clientHeight > 160) return;"));
});
