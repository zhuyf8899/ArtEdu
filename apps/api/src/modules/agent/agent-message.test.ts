import assert from "node:assert/strict";
import test from "node:test";
import { composeAssistantMessage } from "./agent-harness.service";

test("部分完成时保留正文，未完成原因只作为附注", () => {
  // 线上真实数据里出现过：三条产物都存了，正文却被「图片尚未通过视觉要求核验」整段替换。
  const message = composeAssistantMessage("DeepSeek 形象已经做成 SVG，同时生成了 PNG 和 Word 文档。", { status: "partial", reason: "图片尚未通过视觉要求核验" });
  assert.match(message, /DeepSeek 形象已经做成 SVG/);
  assert.match(message, /图片尚未通过视觉要求核验/);
  assert.ok(message.length > "图片尚未通过视觉要求核验".length, "正文不能被原因替换");
});

test("成功时原样返回，失败且没有正文时至少留下原因", () => {
  assert.equal(composeAssistantMessage("已生成并核验", { status: "succeeded", reason: "不该出现" }), "已生成并核验");
  assert.equal(composeAssistantMessage("已生成并核验", null), "已生成并核验");
  assert.equal(composeAssistantMessage("", { status: "failed", reason: "模型不可用" }), "（模型不可用）");
  assert.equal(composeAssistantMessage(undefined, { status: "paused", reason: "用户暂停了本轮生成" }), "（用户暂停了本轮生成）");
});
