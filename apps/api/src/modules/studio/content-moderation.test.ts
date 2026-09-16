import assert from "node:assert/strict";
import test from "node:test";
import { findOcrRiskKeywords } from "./content-moderation";

test("OCR 风险词扫描识别暴力和色情提示词，且限制返回数量", () => {
  const matches = findOcrRiskKeywords("这是血 腥 内容，含有色情和裸聊引导");
  assert.deepEqual(matches.map((item) => item.category), ["色情", "色情", "暴力"]);
  assert.deepEqual(matches.map((item) => item.keyword), ["色情", "裸聊", "血腥"]);
});
