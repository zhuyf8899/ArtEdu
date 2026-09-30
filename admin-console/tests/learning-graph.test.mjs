import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildLearningFramework, buildLearningGraph } from "../src/learningGraphModel.js";

test("所有学习视图共用横向导航，不因切换退出统一布局", async () => {
  const source = await readFile(new URL("../src/MyLearning.jsx", import.meta.url), "utf8");
  assert.match(source, /className="learning-space learning-space--horizontal"/);
  assert.match(source, /className="my-learning-page my-learning-page--compact"/);
  assert.match(source, /aria-pressed=\{view === id\}/);
  assert.match(source, /aria-controls="learning-view-content"/);
  assert.match(source, /id="learning-view-content"/);
  assert.doesNotMatch(source, /view === "graph" \? "learning-space/);
  assert.match(source, /!compact && !autoCompleted && onDelete &&/);
});

test("学习卡片使用响应式列宽和可换行文字，保留小屏单列布局", async () => {
  const styles = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
  assert.match(styles, /\.learning-space--horizontal \{ display: block;/);
  assert.match(styles, /\.learning-space--horizontal \.learning-rail nav \{[^}]*display: flex;[^}]*overflow-x: auto;/);
  assert.match(styles, /\.learning-space--horizontal \.my-course-grid,[^{]*\{ grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(styles, /@media \(max-width: 560px\) \{\s*\.learning-space--horizontal \.my-course-grid,[^{]*\{ grid-template-columns: 1fr;/);
  assert.match(styles, /\.learning-space--horizontal \.note-grid p \{[^}]*overflow-wrap: anywhere;/);
});

test("空学习记录不伪造能力或工具数据，并引导开始课程", () => {
  const graph = buildLearningGraph({ summary: {}, courses: [], tasks: [], notes: [], works: [], workflowRuns: [] });
  assert.equal(graph.summary.courseCount, 0);
  assert.equal(graph.summary.workflowCount, 0);
  assert.deepEqual(graph.events, []);
  assert.equal(graph.recommendations[0].href, "/learning");
  const framework = buildLearningFramework(graph);
  assert.equal(framework.stages.length, 4);
  assert.ok(framework.stages.every((stage) => stage.cells.length === 4));
  assert.ok(framework.stages.every((stage) => stage.cells.every((cell) => cell.state === "none")));
  assert.equal(framework.currentStage.id, "discover");
});

test("图谱只汇总用户真实进度，并根据薄弱进度解释下一步", () => {
  const graph = buildLearningGraph({
    summary: { completedLessons: 3, totalLessons: 8 },
    courses: [
      { id: "advanced", title: "艺术实验", completedLessons: 2, lessonCount: 4, progressPercent: 50, lastStudiedAt: "2026-09-20T10:00:00Z" },
      { id: "intro", title: "AI 入门", completedLessons: 1, lessonCount: 4, progressPercent: 25, lastStudiedAt: "2026-09-22T10:00:00Z" },
    ],
    tasks: [{ id: "task-1", title: "完成练习", taskType: "custom", status: "completed", completedAt: "2026-09-21T10:00:00Z" }],
    notes: [], works: [], workflowRuns: [],
  });
  assert.equal(graph.summary.completedTasks, 1);
  assert.equal(graph.recommendations[0].href, "/learning?course=intro");
  assert.match(graph.recommendations[0].reason, /1\/4/);
  assert.equal(graph.events[0].title, "AI 入门");
  const framework = buildLearningFramework(graph);
  assert.equal(framework.stages[0].cells[0].state, "skilled");
  assert.equal(framework.stages[1].cells[0].state, "skilled");
  assert.equal(framework.stages[1].cells[1].state, "skilled");
  assert.equal(framework.nextCell.title, "体验一次工作流");
});

test("阶段色彩按真实记录阈值变化，不把近期工作流误称全部使用次数", () => {
  const graph = buildLearningGraph({
    summary: { completedLessons: 2, totalLessons: 4 },
    courses: [{ id: "c", lessonCount: 4, completedLessons: 2 }],
    tasks: [], notes: [{ id: "n", title: "反思" }], works: [],
    workflowRuns: [{ id: "r", workflowId: "w", status: "completed" }],
  });
  assert.equal(graph.summary.workflowCount, 1);
  assert.equal(graph.summary.distinctWorkflowCount, 1);
  const framework = buildLearningFramework(graph);
  assert.equal(framework.stages[0].cells[2].state, "skilled");
  assert.equal(framework.stages[1].cells[0].state, "good");
  assert.equal(framework.stages[1].cells[3].state, "good");
});
