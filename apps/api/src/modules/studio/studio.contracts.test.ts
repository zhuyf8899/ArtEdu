import assert from "node:assert/strict";
import test from "node:test";
import { workflowInputSchema, workflowRunExecuteSchema, workflowVersionInputSchema, workInputSchema } from "./studio.contracts";
import { assertCasePublication, caseStorySchema } from "./case-story";

test("收集案例可存草稿，缺少原作者或授权不能提交审核", () => {
  const draft = caseStorySchema.parse({ origin: "collected", creators: ["匿名作者"] });
  assert.equal(draft.allowDocumentDownload, false);
  assert.throws(() => assertCasePublication(draft), /授权/);
  assert.throws(() => assertCasePublication({ ...draft, authorization: "confirmed" }), /授权说明/);
  assert.doesNotThrow(() => assertCasePublication({ ...draft, authorization: "confirmed", authorizationNote: "已获校内展示授权" }));
  assert.doesNotThrow(() => assertCasePublication(caseStorySchema.parse({})));
  assert.equal(caseStorySchema.safeParse({ steps: Array.from({length: 21}, () => ({title:"步骤"})) }).success, false);
  assert.equal(caseStorySchema.safeParse({ steps: [{ title: "步骤", execute: true }] }).success, false);
});

test("作品投稿不接受客户端提供的资源地址或资源元数据", () => {
  const base = { title: "测试作品", summary: "用于验证投稿输入", discipline: "视觉传达" };
  assert.equal(workInputSchema.safeParse({ ...base, assets: [{ externalUrl: "file:///private/a.jpg", fileName: "a.jpg", mimeType: "image/jpeg" }] }).success, false);
  assert.equal(workInputSchema.safeParse({ ...base, assets: [{ externalUrl: "https://user:secret@example.com/a.jpg", fileName: "a.jpg", mimeType: "image/jpeg" }] }).success, false);
  assert.equal(workInputSchema.safeParse(base).success, true);
});

test("工作流入口只接受无凭据 HTTP(S) 地址", () => {
  const base = { name: "安全工作流", description: "入口校验", category: "设计" };
  assert.equal(workflowInputSchema.safeParse({ ...base, entryUrl: "javascript:alert(1)" }).success, false);
  assert.equal(workflowInputSchema.safeParse({ ...base, entryUrl: "https://user:secret@example.com/tool" }).success, false);
  assert.equal(workflowInputSchema.safeParse({ ...base, entryUrl: "https://example.com/tool" }).success, true);
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

test("工作流版本支持内置 Skill，且拒绝循环图", () => {
  const base = {
    schemaVersion: 2,
    nodes: [
      { id: "input", type: "input", position: { x: 0, y: 0 }, data: { label: "需求" } },
      { id: "skill", type: "skill", position: { x: 220, y: 0 }, data: { label: "纹样 Skill", value: "保持四方连续" } },
      { id: "output", type: "preview", position: { x: 440, y: 0 }, data: { label: "预览" } },
    ],
    edges: [{ id: "input-skill", source: "input", target: "skill" }, { id: "skill-output", source: "skill", target: "output" }],
  };
  assert.equal(workflowVersionInputSchema.safeParse({ definition: base }).success, true);
  assert.equal(workflowVersionInputSchema.safeParse({ definition: { ...base, edges: [...base.edges, { id: "cycle", source: "output", target: "input" }] } }).success, false);
});

test("节点执行接口仅允许可选的本次输入，不接受浏览器提交任意节点图", () => {
  assert.equal(workflowRunExecuteSchema.safeParse({ prompt: "生成青绿色连续纹样" }).success, true);
  assert.equal(workflowRunExecuteSchema.safeParse({ prompt: "" }).success, false);
  assert.equal(workflowRunExecuteSchema.safeParse({ definition: { nodes: [] } }).success, true);
  assert.deepEqual(workflowRunExecuteSchema.parse({ definition: { nodes: [] } }), {});
});
