// Isolated frontend fixtures; every API request is intercepted, never writes real records.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import path from "node:path";
const require = createRequire(process.env.ARTEDU_PLAYWRIGHT_ROOT ? path.join(process.env.ARTEDU_PLAYWRIGHT_ROOT, "package.json") : import.meta.url);
const { chromium } = require("playwright");
const output = path.resolve("apps/api/data/qa/knowledge-bindings");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.ARTEDU_BROWSER_PATH ? { executablePath: process.env.ARTEDU_BROWSER_PATH } : {}) });
const base = "http://localhost:4173";
const course = { id: "qa-course", title: "传统纹样现代转译 · 演示", summary: "通过观察、提取与配色完成现代纹样。", category: "视觉设计", difficulty: "beginner", status: "published", lessonCount: 2, completedLessons: 1, progressPercent: 50, versionNumber: 1, knowledgePoints: ["纹样提取", "色彩搭配", "版式表达"], lessons: [
  { id: "qa-l1", courseId: "qa-course", courseTitle: "传统纹样现代转译 · 演示", title: "观察与提取", summary: "从参考素材提取纹样骨架", estimatedMinutes: 15, lessonType: "lesson", learningSteps: ["观察骨架"], knowledgePoints: ["纹样提取"], progressPercent: 100, submittedWorkId: "qa-work", submittedWorkTitle: "我的纹样练习" },
  { id: "qa-l2", courseId: "qa-course", courseTitle: "传统纹样现代转译 · 演示", title: "比较两种配色方案", summary: "说明选色依据", estimatedMinutes: 15, lessonType: "practice", learningSteps: ["比较冷暖色"], knowledgePoints: ["色彩搭配"], progressPercent: 30 },
], resources: [] };
const workflow = { id: "qa-workflow", name: "纹样探索 · 演示", description: "对比构图和色彩方案", status: "published", category: "视觉创作", entryType: "workbench", stepCount: 1, versionNumber: 1,
  versions: [{ id: "qa-v1", versionNumber: 1, published: true, definition: { schemaVersion: 2, nodes: [{ id: "n", type: "note", position: { x: 0, y: 0 }, data: { label: "观察骨架" } }], edges: [], learning: { knowledgePoints: ["纹样提取"], tools: ["DeepSeek"], abilityGoals: ["比较两种方案"] } } }] };
let savedBindings;
let savedDefinition;
const fixture = { profile: { displayName: "示例学习者", roles: ["student"] }, summary: { completedLessons: 1, totalLessons: 2 }, courses: [course], learningLessons: course.lessons, tasks: [], notes: [], works: [{ id: "qa-work", title: "我的纹样练习", status: "draft" }], favorites: [], workflowRuns: [{ id: "qa-run", workflowId: workflow.id, workflowName: workflow.name, status: "completed", learningBindings: workflow.versions[0].definition.learning }] };
const errors = [];
const page = await browser.newPage({ viewport: { width: 1440, height: 1080 } });
page.on("pageerror", (error) => errors.push(error.message));
await page.route("**/api/**", async (route) => {
  const request = route.request(), endpoint = new URL(request.url()).pathname;
  let response;
  if (request.method() === "PUT" && endpoint.endsWith("/knowledge-bindings")) {
    savedBindings = request.postDataJSON(); course.knowledgePoints = savedBindings.knowledgePoints;
    course.lessons = course.lessons.map((lesson) => ({ ...lesson, knowledgePoints: savedBindings.lessons.find((item) => item.lessonId === lesson.id)?.knowledgePoints ?? lesson.knowledgePoints }));
    response = course;
  } else if (request.method() === "POST" && endpoint.endsWith("/versions")) {
    savedDefinition = request.postDataJSON().definition;
    workflow.versions.unshift({ id: "qa-v2", versionNumber: 2, definition: savedDefinition, published: false }); response = { id: "qa-v2" };
  } else response = {
    "/api/auth/me": { id: "qa-admin", username: "qa", displayName: "示例管理员", roles: ["admin"] },
    "/api/health": { status: "ok" },
    "/api/portal/home": { courses: [], workflows: [], works: [], creation: { enabled: false, models: [], quota: {} } },
    "/api/admin/dashboard": { activeModels: 0 },
    "/api/admin/courses": { items: [course] }, "/api/admin/courses/qa-course": course,
    "/api/admin/workflows": { items: [workflow] }, "/api/admin/workflows/qa-workflow": workflow,
    "/api/me/learning-space": { ...fixture, courses: [course], learningLessons: course.lessons },
    "/api/courses": { items: [course] }, "/api/courses/qa-course": course,
  }[endpoint] ?? { items: [] };
  await route.fulfill({ contentType: "application/json", body: JSON.stringify(response) });
});
try {
  await page.goto(`${base}/admin/courses`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "图谱配置", exact: true }).click();
  const modal = page.getByRole("dialog", { name: /图谱配置/ });
  await modal.locator("textarea").first().fill("纹样提取\n色彩搭配\n版式表达\n纹样提取");
  await modal.locator("fieldset").first().locator("textarea").fill("纹样提取\n构图层级");
  await modal.screenshot({ path: path.join(output, "admin-config.png") });
  await modal.getByRole("button", { name: "保存图谱配置", exact: true }).click();
  await modal.waitFor({ state: "hidden" });
  assert.deepEqual(savedBindings.knowledgePoints, ["纹样提取", "色彩搭配", "版式表达"]);
  assert.deepEqual(savedBindings.lessons[0].knowledgePoints, ["纹样提取", "构图层级"]);
  await page.getByRole("button", { name: "图谱配置", exact: true }).click();
  assert.equal(await modal.locator("fieldset").first().locator("textarea").inputValue(), "纹样提取\n构图层级");
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await modal.screenshot({ path: path.join(output, "admin-config-mobile.png") });
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.goto(`${base}/admin/workflows`, { waitUntil: "networkidle" });
  await page.locator(".workflow-admin-row").first().click();
  await page.locator(".workflow-learning-config summary").click();
  const fields = page.locator(".workflow-learning-config textarea");
  await fields.nth(1).fill("DeepSeek\nFigma");
  await fields.nth(2).fill("比较两种方案并解释取舍");
  await page.getByRole("button", { name: "保存版本", exact: true }).click();
  await page.waitForFunction(() => document.querySelector(".workflow-versions")?.textContent.includes("V2"));
  assert.deepEqual(savedDefinition.learning.tools, ["DeepSeek", "Figma"]);
  await page.locator(".workflow-learning-config summary").click();
  assert.equal(await fields.nth(1).inputValue(), "DeepSeek\nFigma");
  await page.locator(".workflow-learning-config").screenshot({ path: path.join(output, "workflow-config.png") });
  await page.goto(`${base}/my-learning`, { waitUntil: "networkidle" });
  await page.locator(".knowledge-point").first().waitFor();
  assert.match(await page.locator(".knowledge-bindings").innerText(), /色彩搭配/);
  const completed = page.locator(".knowledge-point").filter({ has: page.getByRole("heading", { name: "纹样提取", exact: true }) });
  assert.match(await completed.innerText(), /关联课时已完成/);
  await completed.locator("summary").click();
  assert.match(await completed.innerText(), /我的纹样练习/);
  const coverage = page.locator(".knowledge-point").filter({ has: page.getByRole("heading", { name: "版式表达", exact: true }) });
  assert.match(await coverage.innerText(), /尚未落实到具体课时/);
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 1080 });
    await page.evaluate(() => document.fonts.ready);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${width}px knowledge panel overflows`);
    await page.locator(".knowledge-bindings").screenshot({ path: path.join(output, `knowledge-${width}.png`) });
  }
  const next = page.locator(".knowledge-point__next").first();
  await next.click();
  assert.equal(new URL(page.url()).searchParams.get("lesson"), "qa-l2");
  await page.locator(".lesson-knowledge").first().waitFor();
  assert.match(await page.locator(".lesson-knowledge").first().innerText(), /色彩搭配/);
  await page.goto(`${base}/my-learning`, { waitUntil: "networkidle" });
  await page.locator(".knowledge-path__node--2").first().click();
  await page.locator(".knowledge-tools summary").click();
  assert.match(await page.locator(".knowledge-tools").innerText(), /DeepSeek/);
  assert.doesNotMatch(await page.locator(".knowledge-tools").innerText(), /Figma/, "historical run keeps original tool metadata");
  assert.deepEqual(errors, []);
  console.log("PASS: admin save/reopen, multiline deduplication, workflow version bindings, knowledge status/evidence, exact lesson links, historical tool labels and mobile/desktop layout; no real API writes.");
  console.log(`Screenshots: ${output}`);
} catch (error) {
  await page.screenshot({ path: path.join(output, "failure.png"), fullPage: true });
  console.error("Browser errors:", errors); throw error;
} finally { await browser.close(); }
