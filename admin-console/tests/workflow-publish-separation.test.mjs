import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (name) => readFile(new URL(`../src/${name}`, import.meta.url), "utf8");

test("发布与运行分开：试运行只存草稿，绝不顺手发布", async () => {
  const admin = await read("WorkflowAdmin.jsx");
  // 旧行为是 onSave(canPublish)：点一次运行就把内容发布给所有人。现在必须是草稿。
  assert.ok(!admin.includes("onSave(canPublish)"), "运行链路不能再用发布模式保存");
  assert.match(admin, /if \(dirty \|\| !versionId\) \{\s*const saved = await onSave\(false\);/);
  assert.ok(admin.includes("保存草稿并试运行"));
  assert.ok(admin.includes("试运行（不发布）"));
  assert.ok(!admin.includes("发布并运行"), "按钮不能再把发布和运行绑在一起");
});

test("发布是独立动作，需要二次确认", async () => {
  const admin = await read("WorkflowAdmin.jsx");
  assert.ok(admin.includes("setPublishOpen(true)"), "发布按钮要先打开确认框");
  assert.ok(admin.includes('className="workflow-publish-confirm"'), "要有发布确认浮层");
  assert.match(admin, /const confirmPublish = async \(\) => \{[\s\S]*onSave\(true\)/);
  assert.ok(admin.includes("确认发布"));
  const css = await read("styles.css");
  assert.ok(css.includes(".workflow-publish-confirm__card"));
});

test("运行页会标出「草稿试运行」", async () => {
  const runner = await read("WorkflowRunner.jsx");
  assert.ok(runner.includes("run?.trialRun"), "运行页要吃运行记录里的 trialRun");
  assert.ok(runner.includes("草稿试运行"));
  assert.ok(runner.includes("workflow-graph-runner__trial"));
});

test("设计工作台目录带 includeDrafts，草稿只有作者能亲手看到", async () => {
  const api = await read("services/adminApi.js");
  assert.ok(api.includes('params.set("includeDrafts", "1")'));
  const studio = await read("WorkflowStudio.jsx");
  assert.match(studio, /getWorkflows\(query, \{ includeDrafts: true, page: 1, pageSize: WORKFLOW_PAGE_SIZE \}\)/);
  assert.ok(studio.includes("草稿试运行"));
});

test("一键跑到底：提示词直接读节点默认值，不再停下来让人一步步填", async () => {
  const studio = await read("WorkflowStudio.jsx");
  assert.ok(!studio.includes('node.type === "negative_prompt" ||'), "负向提示词不能再中断自动推进");
  assert.ok(studio.includes("const nodesCarryPrompt"), "要先判断工作流自己有没有带提示词");
  // 工作流自带提示词时，输入节点留空也不再停下来问人。
  assert.match(studio, /if \(.*node\.type === "input" && !String\(node\.data\?\.value \?\? ""\)\.trim\(\) && !nodesCarryPrompt\(run\.nodes, run\.edges, node\.id\)\) return;/);
  // 画布上的试运行同样要自动往下执行，不再要求点「执行当前节点」。
  const admin = await read("WorkflowAdmin.jsx");
  assert.ok(admin.includes("autoAdvanced"), "画布要有一键跑到底的自动推进");
  assert.match(admin, /if \(.*node\.type === "input" && !String\(node\.data\?\.value \?\? ""\)\.trim\(\) && !nodesCarryPrompt\(runNodes, run\?\.edges \?\? \[\], node\.id\)\) return;/);
  assert.ok(admin.includes("void executeCurrentNode()"), "自动推进要真的执行当前节点");
});

test("编辑器页不会因为旧守卫把自动推进掐断", async () => {
  const admin = await read("WorkflowAdmin.jsx");
  // executeCurrentNode 里那个"输入节点必须有人填"的判断必须和自动推进同一套规则，
  // 否则自动推进去执行时会被直接 return 掉，运行永远停在 0%（只有 start 事件）。
  assert.match(
    admin,
    /if \(.*activeNode\.type === "input" && !runPrompt\.trim\(\) && !String\(activeNode\.data\.value \|\| ""\)\.trim\(\) && !nodesCarryPrompt\(runNodes, run\?\.edges \?\? \[\], activeStep\?\.id\)\) \{/,
  );
  assert.ok(!/if \(.*activeNode\.type === "input" && !runPrompt\.trim\(\) && !String\(activeNode\.data\.value \|\| ""\)\.trim\(\)\) \{ onNotice/.test(admin), "不能只按输入节点自身判断");
});

test("恢复旧任务时按运行快照读取节点参数", async () => {
  const admin = await read("WorkflowAdmin.jsx");
  assert.ok(admin.includes("const runNodes = run?.nodes?.length ? run.nodes : editor.definition.nodes"));
  assert.ok(admin.includes("const node = runNodes.find"));
  assert.ok(admin.includes("getWorkflowRun(item.id)"));
});

test("目录能检索并翻到第 21 条，后端回传真实总数", async () => {
  const api = await read("services/adminApi.js");
  assert.ok(api.includes('params.set("page", String(options.page))'), "前端要能把页码传给后端");
  assert.ok(api.includes('params.set("pageSize", String(options.pageSize))'), "前端要能控制每页条数");
  const studio = await read("WorkflowStudio.jsx");
  assert.ok(studio.includes("loadMoreWorkflows"), "目录要有加载更多");
  assert.match(studio, /page: 1, pageSize: WORKFLOW_PAGE_SIZE/, "首屏必须显式取第一页");
  assert.ok(studio.includes("workflow-catalog__pager"), "有总数才谈得上翻页");
  assert.ok(studio.includes("没有匹配的节点工作流"), "搜索无结果要和空目录区分开");
  const admin = await read("WorkflowAdmin.jsx");
  assert.match(admin, /getAdminWorkflows\(search, \{ page: 1, pageSize: ADMIN_PAGE_SIZE \}\)/, "管理页同样要分页");
  assert.ok(admin.includes("workflow-admin-pager"));
  const backend = await readFile(new URL("../../apps/api/src/modules/studio/studio.service.ts", import.meta.url), "utf8");
  assert.ok(backend.includes("COUNT(*)::int AS total"), "后端必须返回总数");
  assert.equal((backend.match(/return \{ items: [^\n]*total \};/g) ?? []).length, 2, "目录与管理列表都要回传 total");
});
