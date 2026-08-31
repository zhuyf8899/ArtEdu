import assert from "node:assert/strict";
import test from "node:test";
import { workflowVersionInputSchema, workInputSchema } from "./studio.contracts";

test("作品投稿只接受安全的 HTTP(S) 资源地址", () => {
  const base = { title: "测试作品", summary: "用于验证投稿输入", discipline: "视觉传达" };
  assert.equal(workInputSchema.safeParse({ ...base, assets: [{ externalUrl: "file:///private/a.jpg", fileName: "a.jpg", mimeType: "image/jpeg" }] }).success, false);
  assert.equal(workInputSchema.safeParse({ ...base, assets: [{ externalUrl: "https://user:secret@example.com/a.jpg", fileName: "a.jpg", mimeType: "image/jpeg" }] }).success, false);
  assert.equal(workInputSchema.safeParse({ ...base, assets: [{ externalUrl: "https://example.com/a.jpg", fileName: "a.jpg", mimeType: "image/jpeg" }] }).success, true);
});

test("工作流版本必须包含结构化步骤", () => {
  assert.equal(workflowVersionInputSchema.safeParse({ steps: [] }).success, false);
  const result = workflowVersionInputSchema.parse({ steps: [{ id: "brief", title: "定义目标" }] });
  assert.equal(result.steps[0].estimatedMinutes, 10);
  assert.equal(result.publish, false);
});
