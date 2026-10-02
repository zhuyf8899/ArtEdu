import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildLearningFramework, buildLearningGraph, buildLearningOrbitContent } from "../src/learningGraphModel.js";
import { buildLearningPaths, learningBranches } from "../src/learningPathModel.js";

test("圆内展示真实课程、课时、工作流和笔记，而非重复板块名", () => {
  const graph = buildLearningGraph({
    summary: { completedLessons: 1, totalLessons: 2 },
    courses: [{ id: "course a", title: "AI 辅助设计思维", completedLessons: 1, lessonCount: 2, progressPercent: 50 }],
    learningLessons: [
      { id: "l1", courseId: "course a", courseTitle: "AI 辅助设计思维", title: "提示词结构", progressPercent: 100, learningSteps: ["描述主体、风格与约束"] },
      { id: "l2", courseId: "course a", courseTitle: "AI 辅助设计思维", title: "色彩与构图", progressPercent: 20, learningSteps: ["对比不同配色方案"] },
    ],
    workflowRuns: [{ id: "r", workflowId: "w", workflowName: "纹样探索", status: "completed" }],
    notes: [{ title: "色彩观察" }],
  });
  const contents = buildLearningOrbitContent(graph, buildLearningFramework(graph));
  assert.equal(contents.discover[0].headline, "AI 辅助设计思维");
  assert.equal(contents.discover[1].headline, "提示词结构");
  assert.equal(contents.discover[2].headline, "纹样探索");
  assert.equal(contents.discover[3].headline, "色彩观察");
  assert.deepEqual(contents.discover[0].knowledge, ["提示词结构", "描述主体、风格与约束"]);
  assert.equal(contents.discover[0].next.title, "色彩与构图");
  assert.match(contents.discover[0].next.text, /待学内容.*对比不同配色方案/);
  assert.equal(contents.discover[0].action, "/learning?course=course%20a");
  assert.ok(!contents.discover[0].knowledge.includes("色彩与构图"));
});

test("已选课程、不完整课时、失败工作流和草稿不能误标为已学或已发布", () => {
  const graph = buildLearningGraph({
    courses: [{ id: "c", title: "艺术实验", lessonCount: 1, completedLessons: 0, progressPercent: 0 }],
    learningLessons: [{ courseId: "c", title: "版式层级", progressPercent: 40, learningSteps: ["阅读视觉秩序"] }],
    workflowRuns: [{ id: "r", workflowId: "w", workflowName: "设计流程", status: "failed" }],
    works: [{ title: "我的海报", status: "draft" }],
  });
  const contents = buildLearningOrbitContent(graph, buildLearningFramework(graph));
  assert.equal(contents.discover[0].recordLabel, "已加入课程");
  assert.deepEqual(contents.discover[0].knowledge, []);
  assert.equal(contents.discover[1].recordLabel, "课时学习中");
  assert.deepEqual(contents.discover[1].knowledge, []);
  assert.equal(contents.discover[2].recordLabel, "已尝试工作流");
  assert.equal(contents.discover[2].records[0].detail, "未成功完成");
  assert.equal(contents.create[3].records[0].detail, "已保存作品，未发布");
});

test("缺少课时详情时不根据汇总数字虚构知识，空用户提供明确下一步", () => {
  const graph = buildLearningGraph({ summary: { completedLessons: 8, totalLessons: 8 } });
  const contents = buildLearningOrbitContent(graph, buildLearningFramework(graph));
  assert.ok(Object.values(contents).flat().every((cell) => cell.knowledge.length === 0));
  assert.equal(contents.discover[0].recordLabel, "待选课程");
  assert.equal(contents.discover[0].next.action, "/learning");
  assert.equal(contents.discover[3].recordLabel, "待记录笔记");
});

test("圆形图谱保留四个方面，新增建议圆及可展开的关联分支", async () => {
  const source = await readFile(new URL("../src/LearningGraph.jsx", import.meta.url), "utf8");
  const canvas = await readFile(new URL("../src/LearningPathCanvas.jsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../src/LearningGraph.css", import.meta.url), "utf8");
  assert.doesNotMatch(source, /knowledge-framework__(table|columns|row|cell)/);
  assert.doesNotMatch(source, /knowledge-intro|knowledge-stats|艺术学习，正在生长|学习记录概览/);
  assert.match(canvas, /stage\.cells\.map/);
  assert.match(canvas, /data-node-kind="recommendation"/);
  assert.match(canvas, /data-edge="suggestion-to-stage"/);
  assert.match(canvas, /aria-pressed=\{pressed\}/);
  assert.match(canvas, /hidden=\{!expanded\}/);
  assert.match(canvas, /framework\.stages\.slice\(start, start \+ 2\)/);
  assert.match(source, /onClick=\{\(\) => goTo\(selectedContent\.action\)\}/);
  assert.match(source, /aria-label="图谱板块注释"/);
  assert.match(canvas, /<strong>\{node\.headline\}<\/strong>/);
  assert.doesNotMatch(source, /<strong>\{label\}<\/strong>/);
  assert.match(styles, /\.knowledge-orbits__node \{[^}]*width: 104px;[^}]*height: 104px;[^}]*border-radius: 50%;/);
  assert.match(styles, /\.knowledge-orbits__node--3 \{[^}]*width: 148px;[^}]*height: 148px;/);
  assert.match(styles, /\.knowledge-orbits__viewport \{[^}]*overflow-x: auto;/);
  assert.match(styles, /\.knowledge-orbits__node:focus-visible/);
});

test("学习建议使用实际未完成数量，课程建议精确指向待学课时", () => {
  const graph = buildLearningGraph({ courses: [{ id: "c", title: "创意课程", lessonCount: 2, completedLessons: 1 }], summary: { completedLessons: 1, totalLessons: 2 }, learningLessons: [{ id: "l", courseId: "c", title: "配色练习", progressPercent: 0 }] });
  const framework = buildLearningFramework(graph);
  const paths = buildLearningPaths(graph, framework, buildLearningOrbitContent(graph, framework));
  assert.match(paths.discover.recommendation.reason, /体验一次工作流.*0 \/ 1/);
  assert.equal(paths.explore.recommendation.action, "/learning?course=c&lesson=l");
  assert.match(paths.explore.recommendation.reason, /1 \/ 3/);
  const emptyGraph = buildLearningGraph({});
  const emptyFramework = buildLearningFramework(emptyGraph);
  assert.equal(buildLearningPaths(emptyGraph, emptyFramework, buildLearningOrbitContent(emptyGraph, emptyFramework)).discover.recommendation.action, "/learning");
});

test("仅明确课时、笔记和工作流绑定形成实线，其他关系为建议", () => {
  const graph = buildLearningGraph({ courses: [{ id: "c", title: "课程", lessonCount: 1, completedLessons: 1 }], learningLessons: [{ id: "l", courseId: "c", title: "课时", workflowId: "w", progressPercent: 100 }], notes: [{ id: "n", title: "笔记", courseId: "c", lessonId: "l" }], workflowRuns: [{ id: "r", workflowId: "w", workflowName: "实践", status: "completed" }] });
  const framework = buildLearningFramework(graph);
  const contents = buildLearningOrbitContent(graph, framework);
  const edges = buildLearningPaths(graph, framework, contents).discover.edges;
  assert.equal(edges.length, 6);
  assert.deepEqual(edges.filter((edge) => edge.existing).map((edge) => edge.id), ["course-to-content", "map-to-growth", "ability-to-growth", "content-to-practice"]);
  contents.discover[1].source.courseId = "another";
  contents.discover[1].source.workflowId = "another";
  assert.equal(buildLearningPaths(graph, framework, contents).discover.edges[0].existing, false);
  assert.equal(buildLearningPaths(graph, framework, contents).discover.edges[3].existing, false);
});

test("展开分支仅显示当前课程已配置内容，不捏造知识点", () => {
  const graph = buildLearningGraph({ courses: [{ id: "c", title: "课程" }], learningLessons: [{ id: "l", courseId: "c", title: "提示词", learningSteps: ["明确主体", "比较风格"], progressPercent: 100 }, { id: "other", courseId: "other", title: "其他课程" }] });
  const framework = buildLearningFramework(graph);
  const contents = buildLearningOrbitContent(graph, framework);
  const recommendation = buildLearningPaths(graph, framework, contents).discover.recommendation;
  assert.deepEqual(learningBranches(graph, contents.discover[0], recommendation, 0).map((node) => node.title), ["提示词"]);
  assert.deepEqual(learningBranches(graph, contents.discover[1], recommendation, 1).map((node) => node.title), ["明确主体", "比较风格"]);
  graph.lessons[0].learningSteps = [];
  assert.deepEqual(learningBranches(graph, contents.discover[1], recommendation, 1), []);
  assert.equal(learningBranches(graph, contents.discover[0], recommendation, 4)[0].existing, false);
});

test("全部阶段目标达成后仍可查看各圆详情，不产生虚假的下一步目标", () => {
  const graph = buildLearningGraph({
    summary: { completedLessons: 8, totalLessons: 8 },
    courses: [{ id: "a", completedLessons: 4, lessonCount: 4 }, { id: "b", completedLessons: 4, lessonCount: 4 }],
    tasks: [{ status: "completed", taskType: "custom" }, { status: "completed", taskType: "custom" }],
    notes: [{ id: "a" }, { id: "b" }, { id: "c" }], works: [{ id: "a" }, { id: "b" }],
    workflowRuns: [{ workflowId: "a", status: "completed" }, { workflowId: "b", status: "completed" }, { workflowId: "a", status: "completed" }, { workflowId: "b", status: "completed" }],
  });
  const framework = buildLearningFramework(graph);
  assert.equal(framework.allComplete, true);
  assert.equal(framework.nextCell, undefined);
  assert.equal(framework.currentStage.id, "integrate");
  assert.ok(framework.stages.every((stage) => stage.cells.every((cell) => cell.state === "skilled")));
  const paths = buildLearningPaths(graph, framework, buildLearningOrbitContent(graph, framework));
  assert.ok(Object.values(paths).every((item) => item.recommendation.action === "/learning"));
});

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
