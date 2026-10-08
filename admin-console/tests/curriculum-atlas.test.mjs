import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { atlasCourses, atlasDomains, atlasRelations, atlasNeighbors, atlasEdgePath, findAtlasCourses } from "../src/curriculumAtlas.js";
import { buildCourseGraph, courseGraphPath, courseKnowledge, courseKnowledgeCount, courseAtlasUrl } from "../src/courseKnowledge.js";
import { graphCenter, graphZoom } from "../src/graphViewport.js";

test("图谱缩放和节点定位有安全边界，小屏默认可将课程根节点置于画布中央", () => {
  const viewport = { clientWidth: 338, clientHeight: 460, scrollWidth: 960, scrollHeight: 1075 };
  assert.deepEqual(graphCenter({ x: 480, y: 105 }, 1, viewport), { left: 311, top: 0, behavior: "auto" });
  assert.equal(graphCenter({ x: 960, y: 1075 }, 1, viewport).left, 622);
  assert.equal(graphCenter({ x: -1, y: -10 }, 1, viewport).top, 0);
  assert.equal(graphZoom(2), 1.5);
  assert.equal(graphZoom(.1), .25);
  assert.equal(graphZoom(NaN), 1);
});

test("通用图谱完整覆盖压缩包十个课程方向、24份资料与40个要点", () => {
  const titles = ["用户体验设计", "实体交互之Arduino实操", "陶瓷造型设计", "信息可视化与数据叙事", "字体与版式设计", "设计思维与问题建构", "设计理论之符号学原理", "设计方法与策略", "陶瓷材料工艺与实践", "交互设计"];
  assert.deepEqual(atlasCourses.map((c) => c.title).sort(), titles.sort());
  assert.equal(new Set(atlasCourses.map((c) => c.id)).size, 10);
  assert.equal(atlasCourses.flatMap((c) => c.knowledge).length, 40);
  const resources = atlasCourses.flatMap((c) => c.sources);
  assert.equal(resources.length, 24);
  assert.equal(new Set(resources.map((s) => s.id)).size, 24);
  for (const course of atlasCourses) {
    assert.ok(atlasDomains.some((d) => d.id === course.domain));
    assert.ok(course.sources.every((s) => s.inspected && s.title));
    assert.ok(course.exercise && course.outcome && course.aiPractice);
    assert.ok(!course.courseId && !course.progressPercent && !course.mastery);
    assert.ok(course.x >= 76 && course.x <= 1034 && course.y >= 100 && course.y <= 624);
  }
});

test("课程节点不重叠，所有连线有明确端点且无伪造先修或循环路线", () => {
  for (let i = 0; i < atlasCourses.length; i++) for (let j = i + 1; j < atlasCourses.length; j++) {
    const a = atlasCourses[i], b = atlasCourses[j];
    assert.ok(Math.hypot(a.x - b.x, a.y - b.y) > 170);
  }
  const seen = new Set();
  for (const edge of atlasRelations) {
    assert.ok(atlasCourses.some((c) => c.id === edge.from));
    assert.ok(atlasCourses.some((c) => c.id === edge.to));
    assert.ok(edge.from !== edge.to && ["route", "transfer"].includes(edge.kind));
    assert.ok(edge.reason && !seen.has(`${edge.from}:${edge.to}`));
    seen.add(`${edge.from}:${edge.to}`);
    assert.match(atlasEdgePath(edge), /^M .+ C /);
    assert.doesNotMatch(atlasEdgePath(edge), /NaN|undefined/);
  }
  const visit = (id, stack = []) => {
    assert.ok(!stack.includes(id), "建议路线不能形成循环先修");
    atlasRelations.filter((r) => r.from === id && r.kind === "route").forEach((r) => visit(r.to, [...stack, id]));
  };
  atlasCourses.forEach((c) => visit(c.id));
  const reached = new Set(["atlas-thinking"]);
  for (let i = 0; i < atlasCourses.length; i++) atlasRelations.filter((r) => r.kind === "route" && reached.has(r.from)).forEach((r) => reached.add(r.to));
  assert.equal(reached.size, 10, "默认建议路线连接全部十门课程，没有孤立课程");
  assert.equal(atlasEdgePath({ from: "unknown", to: "unknown" }), "");
});

test("搜索涵盖课程、知识点、教材名，支持方向和多个词的交集", () => {
  assert.equal(findAtlasCourses().length, 10);
  assert.equal(findAtlasCourses("  ARDUINO  ")[0].id, "atlas-arduino");
  assert.equal(findAtlasCourses("能指 所指")[0].id, "atlas-semiotics");
  assert.equal(findAtlasCourses("代尔夫特")[0].id, "atlas-methods");
  assert.equal(findAtlasCourses("", "visual").length, 2);
  assert.equal(findAtlasCourses("Arduino", "material").length, 0);
  assert.equal(findAtlasCourses("不存在的课程").length, 0);
  assert.equal(findAtlasCourses("PWM")[0].id, "atlas-arduino");
  assert.equal(findAtlasCourses("行距 度量")[0].id, "atlas-type");
  assert.equal(atlasNeighbors("unknown").length, 0);
  assert.ok(atlasNeighbors("atlas-thinking").every((n) => n.direction === "next" && n.course));
});

test("十门课程各有独立主题、具体知识、资料依据与建议练习，不复制四点模板", () => {
  assert.equal(Object.keys(courseKnowledge).length, 10);
  assert.equal(courseKnowledgeCount, 95);
  const signatures = new Set(), shapes = new Set();
  for (const course of atlasCourses) {
    const graph = buildCourseGraph(course);
    assert.ok(graph.branches.length >= 3 && graph.branches.length <= 5);
    assert.ok(graph.pointCount >= 7 && graph.pointCount <= 12);
    signatures.add(graph.nodes.map((n) => n.title).join("|"));
    shapes.add(`${graph.branches.length}:${graph.branches.map((b) => b.points.length).join(",")}:${graph.practices.length}`);
    assert.equal(new Set(graph.nodes.map((n) => n.id)).size, graph.nodes.length);
    assert.equal(graph.nodes.filter((n) => n.kind === "root").length, 1);
    for (const node of graph.nodes) {
      assert.ok(node.title && node.summary && node.id.startsWith(`${course.id}:`));
      assert.ok(!node.mastery && !node.progressPercent && !node.lessonId);
      assert.ok(node.sources.every((id) => course.sources.some((s) => s.id === id)), "only this course's inspected resources");
      if (node.kind === "point" || node.kind === "branch") assert.ok(node.sources.length > 0);
      if (node.kind === "practice") {
        assert.ok(node.instruction && node.outcome);
        assert.ok(node.groups.every((key) => graph.branches.some((b) => b.key === key)));
      }
    }
    assert.equal(new URL(courseAtlasUrl(course.id), "http://localhost").searchParams.get("atlasCourse"), course.id);
  }
  assert.equal(signatures.size, 10, "the ten sets of knowledge labels differ");
  assert.ok(shapes.size >= 6, "structure varies with curriculum, not just title/color");
  assert.equal(buildCourseGraph({ id: "unknown" }), null);
});

test("分图连线可追溯、全部节点可达、圆点无重叠且文字布局有安全边界", () => {
  for (const course of atlasCourses) {
    const graph = buildCourseGraph(course);
    const ids = new Set(graph.nodes.map((n) => n.id)), seen = new Set();
    for (const edge of graph.edges) {
      assert.ok(ids.has(edge.from) && ids.has(edge.to) && edge.from !== edge.to);
      assert.ok(edge.reason && ["contains", "practice"].includes(edge.kind));
      assert.ok(!seen.has(`${edge.from}:${edge.to}`));
      seen.add(`${edge.from}:${edge.to}`);
      assert.match(courseGraphPath(graph, edge), /^M .+ C /);
      assert.doesNotMatch(courseGraphPath(graph, edge), /NaN|undefined/);
      assert.equal(edge.kind === "practice", graph.nodes.find((n) => n.id === edge.to).kind === "practice");
    }
    const reached = new Set([graph.nodes[0].id]);
    for (let i = 0; i < graph.nodes.length; i++) graph.edges.filter((e) => reached.has(e.from)).forEach((e) => reached.add(e.to));
    assert.equal(reached.size, ids.size);
    for (let i = 0; i < graph.nodes.length; i++) {
      const a = graph.nodes[i];
      assert.ok(a.x - a.radius >= 0 && a.x + a.radius <= graph.width);
      assert.ok(a.y - a.radius >= 0 && a.y + a.radius <= graph.height);
      for (let j = i + 1; j < graph.nodes.length; j++) {
        const b = graph.nodes[j];
        assert.ok(Math.hypot(a.x - b.x, a.y - b.y) > a.radius + b.radius + 12, `${course.id}: ${a.title}/${b.title}`);
      }
    }
    assert.equal(courseGraphPath(graph, { from: "unknown", to: "unknown" }), "");
  }
});

test("分图使用独立 URL 并保留课程返回、个人扩展及零进度写入边界", async () => {
  const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  const atlas = await readFile(new URL("../src/CurriculumAtlas.jsx", import.meta.url), "utf8");
  const graph = await readFile(new URL("../src/CourseKnowledgeGraph.jsx", import.meta.url), "utf8");
  assert.match(app, /query.get\("atlasCourse"\)/);
  assert.match(atlas, /CourseKnowledgeGraph key=\{courseView.id\}/);
  assert.match(graph, /返回十门课程总图/);
  assert.match(graph, /courseAtlasUrl\(e.target.value\)/);
  assert.match(graph, /不是原教材的作业要求/);
  assert.doesNotMatch(graph, /services\/adminApi|fetch\(|localStorage|sessionStorage|updateLearning/);
});

test("静态图谱与个人 API 失败隔离，个人扩展保留并可往返", async () => {
  const learning = await readFile(new URL("../src/MyLearning.jsx", import.meta.url), "utf8");
  const atlas = await readFile(new URL("../src/CurriculumAtlas.jsx", import.meta.url), "utf8");
  assert.match(learning, /isGenericAtlas \? <CurriculumAtlas/);
  assert.match(learning, /aria-busy=\{!isGenericAtlas && loading\}/);
  assert.match(learning, /learningAtlas === "personal"/);
  assert.match(learning, /onNavigate\("\/my-learning\?atlas=personal"\)/);
  assert.match(learning, /返回通用图谱/);
  assert.match(learning, /isPersonalAtlas && <LearningGraph/);
  assert.doesNotMatch(atlas, /services\/adminApi|fetch\(|getLearningSpace|localStorage|sessionStorage/);
  assert.match(atlas, /颜色区分知识方向，不表示学习进度/);
  assert.match(atlas, /并非原教材内容/);
  assert.match(atlas, /不代表这十门课程均已上线/);
  assert.doesNotMatch(atlas, /\/learning\?course=/);
});
