import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { buildKnowledgeEvidence, learningLabels, normalizeLearningBindings } from "../src/learningBindings.js";
import { buildLearningGraph, buildLearningFramework, buildLearningOrbitContent } from "../src/learningGraphModel.js";
import { buildLearningPaths, learningBranches } from "../src/learningPathModel.js";

test("知识名称支持多行和逗号，去重但不截断超限输入", () => {
  assert.deepEqual(learningLabels(" 色彩\n纹样，色彩;构图"), ["色彩", "纹样", "构图"]);
  assert.throws(() => normalizeLearningBindings({ tools: Array.from({ length: 21 }, (_, index) => `${index}`) }), /最多 20/);
  assert.throws(() => normalizeLearningBindings({ knowledgePoints: "x".repeat(81) }), /80 字/);
});

test("知识状态只来自课时，课程完成和工作流完成不能冒充知识掌握", () => {
  const graph = buildLearningGraph({
    courses: [{ id: "c", title: "纹样课", knowledgePoints: ["纹样", "构图"], lessonCount: 3, completedLessons: 3 }],
    learningLessons: [{ id: "l1", courseId: "c", title: "观察", knowledgePoints: ["纹样"], progressPercent: 100, submittedWorkId: "w", submittedWorkTitle: "我的练习" },
      { id: "l2", courseId: "c", title: "提取", knowledgePoints: ["纹样"], progressPercent: 30 },
      { id: "l3", courseId: "c", title: "配色", knowledgePoints: ["配色"] }],
    workflowRuns: [{ id: "r", status: "completed", learningBindings: { knowledgePoints: ["纹样"], tools: ["Figma"] } }],
  });
  const points = buildKnowledgeEvidence(graph);
  const pattern = points.find((point) => point.name === "纹样");
  assert.equal(pattern.state, "learning");
  assert.equal(pattern.completedCount, 1);
  assert.equal(pattern.next.id, "l2");
  assert.equal(pattern.submissions[0].title, "我的练习");
  assert.equal(pattern.workflows.length, 1);
  assert.equal(points.find((point) => point.name === "构图").state, "coverage");
  assert.equal(points.find((point) => point.name === "配色").state, "not_started");
  assert.equal(points.some((point) => Object.hasOwn(point, "mastery")), false);
});

test("知识建议定位到真实待学课时，有依据，不影响无配置用户", () => {
  const graph = buildLearningGraph({ courses: [{ id: "c a", title: "课程" }], learningLessons: [{ id: "l 1", courseId: "c a", courseTitle: "课程", title: "配色练习", knowledgePoints: ["色彩搭配"], progressPercent: 0 }] });
  const framework = buildLearningFramework(graph);
  const recommendation = buildLearningPaths(graph, framework, buildLearningOrbitContent(graph, framework)).discover.recommendation;
  assert.equal(recommendation.action, "/learning?course=c%20a&lesson=l%201");
  assert.match(recommendation.reason, /色彩搭配.*0 \/ 1/);
  assert.deepEqual(buildKnowledgeEvidence(buildLearningGraph({})), []);
});

test("课时分支优先显示明确知识绑定，无绑定时仍显示教学步骤", () => {
  const graph = buildLearningGraph({ courses: [{ id: "c", title: "课" }], learningLessons: [{ id: "l", courseId: "c", title: "配色课", knowledgePoints: ["色彩搭配"], learningSteps: ["对比色温"], progressPercent: 0 }] });
  const framework = buildLearningFramework(graph), contents = buildLearningOrbitContent(graph, framework);
  const branches = learningBranches(graph, contents.discover[1], buildLearningPaths(graph, framework, contents).discover.recommendation, 1);
  assert.deepEqual(branches.map((branch) => [branch.title, branch.relation]), [["色彩搭配", "关联知识点"], ["对比色温", "课时内容"]]);
});

test("课程和工作流编辑器、图谱详情使用统一配置入口和明确状态", async () => {
  const course = await readFile(new URL("../src/AdminCourses.jsx", import.meta.url), "utf8");
  const workflow = await readFile(new URL("../src/WorkflowAdmin.jsx", import.meta.url), "utf8");
  const evidence = await readFile(new URL("../src/KnowledgeEvidence.jsx", import.meta.url), "utf8");
  const graph = await readFile(new URL("../src/LearningGraph.jsx", import.meta.url), "utf8");
  assert.match(course, /图谱配置/);
  assert.match(workflow, /normalizeLearningBindings\(editor.definition.learning\)/);
  assert.match(evidence, /课程涉及.*未开始.*学习中.*关联课时已完成/);
  assert.match(evidence, /尚未做能力评价/);
  assert.match(graph, /目标达成/);
  assert.doesNotMatch(graph, /熟练/);
});
