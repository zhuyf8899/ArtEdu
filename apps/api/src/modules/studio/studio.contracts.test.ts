import assert from "node:assert/strict";
import test from "node:test";
import { workflowVersionInputSchema, workInputSchema } from "./studio.contracts";

test("作品投稿不接受客户端提供的资源地址或资源元数据", () => {
  const base = { title: "测试作品", summary: "用于验证投稿输入", discipline: "视觉传达" };
  assert.equal(workInputSchema.safeParse({ ...base, assets: [{ externalUrl: "file:///private/a.jpg", fileName: "a.jpg", mimeType: "image/jpeg" }] }).success, false);
  assert.equal(workInputSchema.safeParse({ ...base, assets: [{ externalUrl: "https://user:secret@example.com/a.jpg", fileName: "a.jpg", mimeType: "image/jpeg" }] }).success, false);
  assert.equal(workInputSchema.safeParse(base).success, true);
});

test("工作流版本可兼容旧步骤结构", () => {
  assert.equal(workflowVersionInputSchema.safeParse({ steps: [] }).success, false);
  const result = workflowVersionInputSchema.parse({ steps: [{ id: "brief", title: "定义目标" }] });
  assert.equal(result.steps?.[0]?.estimatedMinutes, 10);
  assert.equal(result.publish, false);
});

test("工作流版本支持 ComfyUI 式节点和连线", () => {
  const result = workflowVersionInputSchema.parse({
    definition: {
      schemaVersion: 2,
      nodes: [
        { id: "input-1", type: "input", position: { x: 0, y: 0 }, data: { label: "需求" } },
        { id: "model-1", type: "model", position: { x: 250, y: 0 }, data: { label: "模型" } },
      ],
      edges: [{ id: "edge-1", source: "input-1", target: "model-1" }],
    },
  });
  assert.equal(result.definition?.nodes.length, 2);
  assert.equal(result.definition?.edges[0]?.target, "model-1");
  assert.equal(workflowVersionInputSchema.safeParse({ definition: { schemaVersion: 2, nodes: [{ id: "same", type: "input", position: { x: 0, y: 0 }, data: {} }], edges: [{ id: "bad", source: "same", target: "same" }] } }).success, false);
});
