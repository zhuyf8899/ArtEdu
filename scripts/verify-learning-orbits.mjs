// Optional local browser QA. Set ARTEDU_PLAYWRIGHT_ROOT to an installed Playwright package root.
// Only frontend fixtures are intercepted: no real login, learning writes, or model calls.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const require = createRequire(process.env.ARTEDU_PLAYWRIGHT_ROOT
  ? path.join(process.env.ARTEDU_PLAYWRIGHT_ROOT, "package.json") : import.meta.url);
const { chromium } = require("playwright");
const base = process.env.ARTEDU_QA_URL || "http://localhost:4173";
const output = path.resolve(process.env.ARTEDU_QA_OUTPUT || "design-qa-assets/learning-orbits");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.ARTEDU_BROWSER_PATH ? { executablePath: process.env.ARTEDU_BROWSER_PATH } : {}) });
const empty = { profile: { displayName: "学习者", roles: ["student"] }, summary: { completedLessons: 0, totalLessons: 0 }, courses: [], tasks: [], notes: [], works: [], favorites: [], workflowRuns: [] };
let fixture = {
  ...empty, summary: { completedLessons: 3, totalLessons: 8 },
  courses: [{ id: "qa-course", title: "AI 艺术入门", completedLessons: 3, lessonCount: 8, progressPercent: 38 }],
  learningLessons: [
    { id: "qa-l1", courseId: "qa-course", courseTitle: "AI 艺术入门", title: "提示词结构", learningSteps: ["主体、风格与约束"], progressPercent: 100 },
    { id: "qa-l2", courseId: "qa-course", courseTitle: "AI 艺术入门", title: "色彩表达", learningSteps: ["比较冷暖色"], progressPercent: 100 },
    { id: "qa-l3", courseId: "qa-course", courseTitle: "AI 艺术入门", title: "构图层次", learningSteps: ["安排视觉重心"], progressPercent: 100 },
    { id: "qa-l4", courseId: "qa-course", courseTitle: "AI 艺术入门", title: "多方案比较", learningSteps: ["比较设计方案"], progressPercent: 0 },
  ],
  tasks: [{ id: "qa-task", title: "创作练习", status: "completed", taskType: "custom" }],
  notes: [{ id: "qa-note", title: "工具观察", content: "练习之后记录自己的方法。", createdAt: "2026-10-01T08:00:00Z", updatedAt: "2026-10-01T08:00:00Z" }],
  workflowRuns: [{ id: "qa-run", workflowId: "qa-workflow", workflowName: "纹样探索", status: "completed" }],
};
const errors = [];
let page;
try {
  page = await browser.newPage({ viewport: { width: 1440, height: 1080 } });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/**", async (route) => {
    const endpoint = new URL(route.request().url()).pathname;
    const responses = {
      "/api/auth/me": { id: "qa-student", displayName: "学习者", roles: ["student"] },
      "/api/me/learning-space": fixture,
      "/api/me/recent-resources": { items: [] },
      "/api/courses": { items: fixture.courses },
      "/api/courses/qa-course": { ...fixture.courses[0], author: "演示教师", tools: ["AI"], lessons: fixture.learningLessons?.map((lesson) => ({ ...lesson, estimatedMinutes: 15 })), resources: [] },
      "/api/portal/home": { courses: [], workflows: [], works: [], creation: { enabled: false, models: [], quota: {} } },
      "/api/health": { status: "ok" },
    };
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(responses[endpoint] ?? { items: [] }) });
  });
  await page.goto(`${base}/my-learning?atlas=personal`, { waitUntil: "networkidle" });
  await page.locator(".knowledge-orbits__node").first().waitFor();
  assert.equal(await page.locator(".knowledge-intro, .knowledge-stats").count(), 0, "graph has no duplicate welcome or summary cards");
  assert.equal(await page.locator(".knowledge-orbits__stage").count(), 2);
  assert.equal(await page.locator('[data-node-kind="record"]').count(), 8);
  assert.equal(await page.locator('[data-node-kind="recommendation"]').count(), 2);
  assert.equal(await page.locator('[data-edge="suggestion-to-stage"]').count(), 1);
  assert.equal(await page.locator(".knowledge-path__edges g").count(), 12);
  assert.equal(await page.locator(".knowledge-orbits__annotations > span").count(), 5);
  assert.equal(await page.locator(".knowledge-orbits__node strong", { hasText: "我的学习地图" }).count(), 0);
  assert.equal(await page.locator(".knowledge-orbits__node strong").first().innerText(), "AI 艺术入门");
  await page.locator('.knowledge-path__node--0').first().click();
  assert.equal(await page.locator('.knowledge-path__node--0 .knowledge-orbits__node-record').first().innerText(), '本课程 3/8 课时');
  assert.equal(await page.locator('.knowledge-orbits__detail-progress strong').innerText(), '3 / 3 节课时');
  assert.match(await page.locator('.knowledge-orbits__detail-progress').innerText(), /阶段累计目标.*不是上方单条记录/s);
  await page.getByRole('button', { name: '收起分支', exact: true }).click();
  for (const [width, height] of [[1440, 1080], [1280, 900], [768, 1024], [390, 844]]) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => document.fonts.ready);
    const geometry = await page.evaluate(() => {
      const stage = document.querySelector(".knowledge-orbits__stage");
      const nodes = [...stage.querySelectorAll(".knowledge-orbits__node")].map((node) => {
        const r = node.getBoundingClientRect();
        const label = node.querySelector("strong");
        return { x: r.x + r.width / 2, y: r.y + r.height / 2, radius: r.width / 2, width: r.width, height: r.height, round: getComputedStyle(node).borderRadius, labelFits: label.scrollWidth <= label.clientWidth };
      });
      return { pageWidth: document.documentElement.scrollWidth, viewportWidth: innerWidth, nodes };
    });
    assert.equal(geometry.viewportWidth, width, "browser viewport matches the requested test size");
    assert.ok(geometry.pageWidth <= geometry.viewportWidth + 1, `${width}px page must not overflow`);
    if (width >= 1280) assert.ok(await page.locator(".knowledge-orbits__viewport").evaluate((node) => node.scrollWidth <= node.clientWidth + 1), "focused two stages fit on desktop");
    for (const node of geometry.nodes) {
      assert.equal(node.width, node.height, "nodes remain circular");
      assert.equal(node.round, "50%");
      assert.equal(node.labelFits, true, "domain labels remain readable");
    }
    for (let i = 0; i < geometry.nodes.length; i++) for (let j = i + 1; j < geometry.nodes.length; j++) {
      const a = geometry.nodes[i], b = geometry.nodes[j];
      assert.ok(Math.hypot(a.x - b.x, a.y - b.y) > a.radius + b.radius + 8, "circles must not overlap");
    }
    await page.locator(".knowledge-orbits").screenshot({ path: path.join(output, `graph-${width}.png`) });
  }
  await page.getByRole("button", { name: "查看全部阶段", exact: true }).click();
  assert.equal(await page.locator(".knowledge-orbits__stage").count(), 4);
  assert.equal(await page.locator('[data-node-kind="record"]').count(), 16);
  assert.equal(await page.locator('[data-node-kind="recommendation"]').count(), 4);
  assert.equal(await page.locator('[data-edge="suggestion-to-stage"]').count(), 3);
  await page.locator(".knowledge-path__node--3").last().click();
  assert.ok(await page.locator(".knowledge-orbits__viewport").evaluate((node) => node.scrollLeft > 0), "mobile can reach the final stage");
  await page.locator(".knowledge-orbits").screenshot({ path: path.join(output, "graph-mobile-last-stage.png") });
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.locator(".knowledge-path__node--0").first().click();
  assert.equal(await page.locator(".knowledge-path__expanded .knowledge-path__leaf").count(), 3);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "expanded branches do not overflow mobile");
  await page.locator(".knowledge-path__expanded").screenshot({ path: path.join(output, "branches-mobile.png") });
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.locator(".knowledge-orbits__detail-body li", { hasText: "主体、风格与约束" }).waitFor();
  assert.equal(await page.locator(".knowledge-orbits__next > strong").innerText(), "多方案比较");
  for (const node of await page.locator('[data-node-kind="record"]').all()) {
    await node.click();
    assert.equal(await node.getAttribute("aria-pressed"), "true");
    assert.equal(await page.locator('[data-node-kind][aria-pressed="true"]').count(), 1);
    assert.ok(await page.getByRole("region", { name: "选中板块学习详情" }).isVisible());
    assert.equal(new URL(page.url()).pathname, "/my-learning", "selecting a node keeps the graph open");
  }
  await page.locator('[data-node-kind="recommendation"]').first().click();
  await page.getByRole("region", { name: "学习建议与推荐依据" }).waitFor();
  assert.match(await page.locator(".knowledge-path__reason").innerText(), /1 \/ 2/);
  await page.locator(".knowledge-path__recommendation").getByRole("button", { name: "开始学习", exact: true }).click();
  assert.equal(await page.locator('.learning-rail nav button[aria-pressed="true"]').innerText(), "学习笔记");
  await page.locator(".learning-rail nav button", { hasText: "知识图谱" }).click();
  await page.locator(".knowledge-path__node--3").first().focus();
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "前往学习笔记", exact: true }).click();
  await page.locator(".learning-rail nav button", { hasText: "学习笔记" }).waitFor();
  assert.equal(await page.locator('.learning-rail nav button[aria-pressed="true"]').innerText(), "学习笔记");
  await page.locator(".learning-rail nav button", { hasText: "知识图谱" }).click();
  await page.locator(".knowledge-orbits__evidence summary").click();
  await page.locator(".knowledge-evidence__event", { hasText: "工具观察" }).waitFor({ state: "visible" });
  await page.locator(".knowledge-path__node--0").first().click();
  await page.locator(".knowledge-orbits__next").getByRole("button", { name: "开始下一步", exact: true }).click();
  await page.locator(".lesson-card--recommended").waitFor();
  assert.equal(new URL(page.url()).searchParams.get("lesson"), "qa-l4");
  assert.match(await page.locator(".lesson-card--recommended").innerText(), /多方案比较/);
  assert.equal(await page.locator(".lesson-card--recommended").evaluate((node) => document.activeElement === node), true);
  await page.screenshot({ path: path.join(output, "recommended-lesson.png") });
  fixture = empty;
  await page.goto(`${base}/my-learning?atlas=personal`, { waitUntil: "networkidle" });
  await page.locator(".knowledge-orbits__node.is-none").first().waitFor();
  assert.equal(await page.locator('[data-node-kind="record"].is-none').count(), 8);
  await page.locator(".knowledge-orbits").screenshot({ path: path.join(output, "graph-empty.png") });
  await page.locator('[data-node-kind="recommendation"]').first().click();
  await page.locator(".knowledge-path__recommendation").getByRole("button", { name: "开始学习", exact: true }).click();
  assert.equal(new URL(page.url()).pathname, "/learning");
  assert.deepEqual(errors, [], "no browser runtime errors");
  console.log("PASS: focused two-stage journey and complete four-stage map; 16 record circles + 4 recommendations; labeled relations, expandable branches, 4 viewports, all record details, keyboard, recommendation reasons/actions, exact lesson focus and empty state.");
  console.log(`Screenshots: ${output}`);
} catch (error) {
  console.error("Browser errors:", errors);
  if (page) await page.screenshot({ path: path.join(output, "failure.png"), fullPage: true });
  throw error;
} finally {
  await browser.close();
}
