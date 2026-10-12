import assert from "node:assert/strict";
import test from "node:test";
import { workflowInputSchema, workflowRunExecuteSchema, workflowVersionInputSchema, workInputSchema } from "./studio.contracts";
import { assertCaseCover, assertCasePublication, caseStorySchema, visibleCaseStory } from "./case-story";
import { assertCaseEditorial, findCaseEditorialIssues } from "./case-editorial";

test("收集案例可存草稿，缺少原作者或授权不能提交审核", () => {
  const draft = caseStorySchema.parse({ origin: "collected", creators: ["匿名作者"] });
  assert.equal(draft.allowDocumentDownload, false);
  assert.throws(() => assertCasePublication(draft), /授权/);
  assert.throws(() => assertCasePublication({ ...draft, authorization: "confirmed" }), /授权说明/);
  assert.doesNotThrow(() => assertCasePublication({ ...draft, authorization: "confirmed", authorizationNote: "已获校内展示授权" }));
  assert.throws(() => assertCasePublication(caseStorySchema.parse({})), /标明案例来源/);
  assert.doesNotThrow(() => assertCasePublication(caseStorySchema.parse({ origin: "platform" })));
  assert.equal(caseStorySchema.safeParse({ steps: Array.from({length: 21}, () => ({title:"步骤"})) }).success, false);
  assert.equal(caseStorySchema.safeParse({ steps: [{ title: "步骤", execute: true }] }).success, false);
});

test("案例提交审核必须有图片封面，视频和文档只能作为补充材料", () => {
  assert.throws(() => assertCaseCover(0), /至少上传一张图片/);
  assert.doesNotThrow(() => assertCaseCover(1));
  assert.doesNotThrow(() => assertCaseCover(3));
});

test("展览来源字段兼容旧案例，链接严格校验且不代填授权", () => {
  const legacy = caseStorySchema.parse({ origin: "collected" });
  assert.equal(legacy.displayStyle, "case-study");
  assert.equal(legacy.sourceUrl, "");
  const source = { sourceName: "CVPR Art", sourceUrl: "https://thecvf-art.com/", originalUrl: "https://thecvf-art.com/project.php?year=2025&id=1043", exhibitionName: "CVPR Art Gallery", exhibitionYear: "2025", displayStyle: "exhibition" };
  const work = workInputSchema.parse({ title: "外部艺术作品", summary: "作品介绍", discipline: "AI 艺术", story: { origin: "collected", ...source } });
  assert.equal(work.story?.originalUrl, source.originalUrl);
  assert.equal(work.story?.authorization, "pending");
  assert.throws(() => assertCasePublication(work.story!), /授权/);
  for (const value of ["javascript:alert(1)", "file:///private", "data:text/html,test", "https://user:secret@example.com/", "https://exa\nmple.com", "/relative", "https://"]) {
    assert.equal(caseStorySchema.safeParse({ sourceUrl: value }).success, false);
    assert.equal(caseStorySchema.safeParse({ originalUrl: value }).success, false);
  }
  assert.equal(caseStorySchema.safeParse({ exhibitionYear: "25" }).success, false);
});

test("作者叙述检查拦截编辑说明，但保留创作反思、技术经历和提示词", () => {
  assert.throws(() => assertCaseEditorial({ summary: "原作页面包含视频，但该视频资源目前返回 404；这里先展示已获授权的封面。" }), /项目简介/);
  assert.throws(() => assertCaseEditorial({ story: { reflection: "资料整理说明：工具字段留空。" } }), /经验与反思/);
  assert.throws(() => assertCaseEditorial({ story: { creators: ["刘樾（其余团队成员署名待补充）"] } }), /原作者署名/);
  const author = { summary: "我们尝试在网页作品中使用404错误表达失落。视频资源返回404后，我们修复了素材路径。", story: caseStorySchema.parse({ reflection: "AI是放大器，而非替代者。可生产性仍需另行验证。", editorialNote: "资料整理说明：原作视频待补充", steps: [{ title: "生成", prompt: "本次上传参考图片，整理资料后生成纹样", parameters: "api_status=404", description: "我们使用AI开展创作实验" }] }) };
  assert.deepEqual(findCaseEditorialIssues(author), []);
  assert.doesNotThrow(() => assertCaseEditorial(author));
});

test("普通读者无法获取编辑备注；原作者与审核人员保留备注且不修改来源", () => {
  const story = caseStorySchema.parse({ sourceName: "CVPR Art", editorialNote: "内部素材核对", authorizationNote: "内部授权核对" });
  const publicStory = visibleCaseStory(story, false);
  assert.equal(publicStory.editorialNote, ""); assert.equal(publicStory.authorizationNote, "");
  assert.equal(publicStory.sourceName, "CVPR Art");
  assert.equal(visibleCaseStory(story, true).editorialNote, "内部素材核对");
  assert.equal(story.editorialNote, "内部素材核对");
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
        { id: "negative-1", type: "negative_prompt", position: { x: 120, y: 0 }, data: { label: "负向提示词", value: "水印" } },
        { id: "model-1", type: "model", position: { x: 250, y: 0 }, data: { label: "模型" } },
      ],
      edges: [{ id: "edge-1", source: "input-1", target: "negative-1" }, { id: "edge-2", source: "negative-1", target: "model-1" }],
    },
  });
  assert.equal(result.definition?.nodes.length, 3);
  assert.equal(result.definition?.edges[1]?.target, "model-1");
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

test("普通投稿不能自选精选模块，读取旧案例默认归入社区", () => {
  const base = { title: "测试作品", summary: "创作理念", discipline: "艺术" };
  assert.equal(caseStorySchema.parse({}).collection, "community");
  assert.equal(caseStorySchema.parse({ collection: "art-selection" }).collection, "art-selection");
  assert.equal(workInputSchema.safeParse({ ...base, story: { collection: "art-selection" } }).success, false);
  assert.equal(workInputSchema.safeParse({ ...base, collection: "art-selection" }).success, false);
});

test("画布分组随版本保存，并拒绝引用不存在的节点", () => {
  const nodes = [
    { id: "a", type: "input", position: { x: 0, y: 0 }, data: { label: "输入" } },
    { id: "b", type: "preview", position: { x: 200, y: 0 }, data: { label: "输出" } },
  ];
  const group = { id: "group-1", title: "准备与输出", color: "#9ed85b", nodeIds: ["a", "b"] };
  const definition = { schemaVersion: 2, nodes, edges: [{ id: "a-b", source: "a", target: "b" }], groups: [group] };
  assert.deepEqual(workflowVersionInputSchema.parse({ definition }).definition?.groups[0], group);
  assert.equal(workflowVersionInputSchema.safeParse({ definition: { ...definition, groups: [{ ...group, nodeIds: ["a", "missing"] }] } }).success, false);
});

test("节点执行接口仅允许可选的本次输入，不接受浏览器提交任意节点图", () => {
  assert.equal(workflowRunExecuteSchema.safeParse({ prompt: "生成青绿色连续纹样" }).success, true);
  assert.equal(workflowRunExecuteSchema.parse({ negativePrompt: "文字、水印" }).negativePrompt, "文字、水印");
  assert.equal(workflowRunExecuteSchema.safeParse({ negativePrompt: "x".repeat(1501) }).success, false);
  assert.equal(workflowRunExecuteSchema.safeParse({ prompt: "" }).success, false);
  assert.equal(workflowRunExecuteSchema.safeParse({ definition: { nodes: [] } }).success, true);
  assert.deepEqual(workflowRunExecuteSchema.parse({ definition: { nodes: [] } }), {});
});
