import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (name) => readFile(new URL(`../src/${name}`, import.meta.url), "utf8");

test("发布与运行分开：试运行只存草稿，绝不顺手发布", async () => {
  const admin = await read("WorkflowAdmin.jsx");
  // 旧行为是 onSave(canPublish)：点一次运行就把内容发布给所有人。现在必须是草稿。
  assert.ok(!admin.includes("onSave(canPublish)"), "运行链路不能再用发布模式保存");
  assert.match(admin, /if \(dirty \|\| !selected\.versions\?\.length\) \{\s*const saved = await onSave\(false\);/);
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
  assert.match(studio, /getWorkflows\("", \{ includeDrafts: true \}\)/);
  assert.ok(studio.includes("草稿试运行"));
});

test("一键跑到底：提示词直接读节点默认值，不再停下来让人一步步填", async () => {
  const studio = await read("WorkflowStudio.jsx");
  assert.ok(!studio.includes('node.type === "negative_prompt" ||'), "负向提示词不能再中断自动推进");
  assert.ok(studio.includes("const nodesCarryPrompt"), "要先判断工作流自己有没有带提示词");
  // 工作流自带提示词时，输入节点留空也不再停下来问人。
  assert.match(studio, /if \(node\.type === "input" && !String\(node\.data\?\.value \?\? ""\)\.trim\(\) && !nodesCarryPrompt\(run\.nodes\)\) return;/);
  // 画布上的试运行同样要自动往下执行，不再要求点「执行当前节点」。
  const admin = await read("WorkflowAdmin.jsx");
  assert.ok(admin.includes("autoAdvanced"), "画布要有一键跑到底的自动推进");
  assert.match(admin, /if \(node\.type === "input" && !String\(node\.data\?\.value \?\? ""\)\.trim\(\) && !nodesCarryPrompt\(editor\.definition\.nodes\)\) return;/);
  assert.ok(admin.includes("void executeCurrentNode()"), "自动推进要真的执行当前节点");
});

test("编辑器页不会因为旧守卫把自动推进掐断", async () => {
  const admin = await read("WorkflowAdmin.jsx");
  // executeCurrentNode 里那个"输入节点必须有人填"的判断必须和自动推进同一套规则，
  // 否则自动推进去执行时会被直接 return 掉，运行永远停在 0%（只有 start 事件）。
  assert.match(
    admin,
    /if \(activeNode\.type === "input" && !runPrompt\.trim\(\) && !String\(activeNode\.data\.value \|\| ""\)\.trim\(\) && !nodesCarryPrompt\(editor\.definition\.nodes\)\) \{/,
  );
  assert.ok(!/if \(activeNode\.type === "input" && !runPrompt\.trim\(\) && !String\(activeNode\.data\.value \|\| ""\)\.trim\(\)\) \{ onNotice/.test(admin), "不能只按输入节点自身判断");
});
