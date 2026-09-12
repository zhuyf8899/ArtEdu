import assert from "node:assert/strict";
import test from "node:test";
import { ragQuerySchema } from "./rag.contracts";

test("RAG 查询契约使用课程范围和允许联网兜底的安全默认值", () => {
  assert.deepEqual(ragQuerySchema.parse({ query: "宋锦的配色规律" }), {
    query: "宋锦的配色规律",
    scope: "course",
    allowWebFallback: true,
  });
});

test("RAG 查询拒绝空问题和未知检索范围", () => {
  assert.throws(() => ragQuerySchema.parse({ query: " ", scope: "course" }));
  assert.throws(() => ragQuerySchema.parse({ query: "纹样", scope: "all" }));
});
