// 回归护栏：「建议提问内容」是一条两段式链路（先出回复，再补三条后续提问）。
// 任何一段断掉，界面上都只是安静地少一块内容，不会报错——所以用测试盯住接线。
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { findReplyIndex, mergeFollowupQuestions, parseFollowupQuestions, withSuggestions } from "../src/followupQuestions.js";

const workspace = () => readFile(new URL("../src/CreationWorkspace.jsx", import.meta.url), "utf8");
const portal = () => readFile(new URL("../src/Portal.jsx", import.meta.url), "utf8");

test("模型输出里的 JSON 数组被解析成三条建议提问", () => {
  assert.deepEqual(
    parseFollowupQuestions('这是建议：["能再举一个例子吗？", "这一步常见错误有哪些？", "接下来练什么？"]'),
    ["能再举一个例子吗？", "这一步常见错误有哪些？", "接下来练什么？"],
  );
  // 代码围栏、重复项、超长/过短的条目都不该漏进界面。
  const fenced = `\`\`\`json\n["能再举一个例子吗？", "能再举一个例子吗？", "短", "${"x".repeat(101)}"]\n\`\`\``;
  assert.deepEqual(parseFollowupQuestions(fenced), ["能再举一个例子吗？"]);
  assert.deepEqual(parseFollowupQuestions("模型跑题了，没有数组"), []);
  assert.deepEqual(parseFollowupQuestions(null), []);
});

test("模型没给出可用建议时用兜底问题补齐，最多三条", () => {
  const merged = mergeFollowupQuestions(["你更想临摹还是自己创作？"]);
  assert.equal(merged.length, 3);
  assert.equal(merged[0], "你更想临摹还是自己创作？");
  assert.deepEqual(mergeFollowupQuestions([]).length, 3);
});

test("建议挂载按「助手回复 + 正文一致」定位，不受会话压缩与后续追问影响", () => {
  const messages = [
    { role: "user", content: "第一个问题" },
    { role: "assistant", content: "第一段回复" },
    { role: "user", content: "第二个问题" },
    { role: "assistant", content: "第二段回复" },
  ];
  assert.equal(findReplyIndex(messages, "第一段回复"), 1);
  assert.equal(findReplyIndex(messages, "第二段回复"), 3);
  assert.equal(findReplyIndex(messages, "不存在的内容"), -1);
  // 会话被压缩后（只剩最近几条）仍能定位到对的那条；找不到时整块建议不显示。
  const compacted = messages.slice(2);
  assert.equal(findReplyIndex(compacted, "第一段回复"), -1);
  assert.equal(findReplyIndex(compacted, "第二段回复"), 1);
  assert.deepEqual(withSuggestions(compacted, -1, ["a"]) , compacted);
  assert.deepEqual(withSuggestions(compacted, 1, ["接着问 A"])[1].suggestions, ["接着问 A"]);
});

test("创作页把建议挂到本轮回复上，并把点选的建议带回输入框", async () => {
  const source = await workspace();
  assert.ok(source.includes("if (suggestionModelId && onSuggest)"), "必须真的调用建议接口，而不是只留占位文案");
  assert.ok(source.includes("mergeFollowupQuestions(questions)"));
  assert.ok(source.includes("withSuggestions(items, findReplyIndex(items, replyContent), questions)"), "本地消息用正文定位后再挂建议");
  assert.ok(source.includes("withSuggestions(current.messages, storedIndex, questions)"), "落库的那一份也要挂上");
  assert.ok(source.includes("const pickSuggestion = useCallback"));
  assert.ok(source.includes("onPick={pickSuggestion}"));
  assert.ok(!source.includes("current?.messages?.length !== finalMessages.length"), "不能再用数组长度判断建议该不该落地（会话压缩后会误判）");
});

test("门户把建议接口接到 Agent 通道，并透传场景与系统提示", async () => {
  const source = await portal();
  assert.ok(source.includes("const suggestFollowups = async ({ question, answer, modelId }, signal)"));
  assert.ok(source.includes('scenario: "chat"'), "建议提问走 chat 场景，不能触发图片/文档通道");
  assert.ok(source.includes('parameters: { source: "followup-suggestions" }'));
  assert.ok(source.includes("只输出 JSON 字符串数组"));
  assert.ok(source.includes("onSuggest={suggestFollowups}"), "创作页必须收到建议回调");
});
