// Isolated frontend QA. Intercept every API: no login writes, learning mutations or model calls.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { atlasCourses } from "../admin-console/src/curriculumAtlas.js";
import { buildCourseGraph, courseAtlasUrl } from "../admin-console/src/courseKnowledge.js";
const require = createRequire(process.env.ARTEDU_PLAYWRIGHT_ROOT ? path.join(process.env.ARTEDU_PLAYWRIGHT_ROOT, "package.json") : import.meta.url);
const { chromium } = require("playwright");
const base = process.env.ARTEDU_QA_URL || "http://localhost:4173";
const output = path.resolve("apps/api/data/qa/curriculum-atlas");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.ARTEDU_BROWSER_PATH ? { executablePath: process.env.ARTEDU_BROWSER_PATH } : {}) });
const page = await browser.newPage({ viewport: { width: 1440, height: 1080 } });
let personalFails = true;
const writes = [], errors = [];
async function closeNodeDetail() {
  if (await page.locator('.course-knowledge__detail[open]').count()) await page.getByRole('button', { name: '关闭节点详情', exact: true }).click();
}
async function openSettings() {
  if (await page.locator('.course-knowledge__settings').getAttribute('open') === null) await page.locator('.course-knowledge__settings > summary').click();
}
async function assertNodeInFrame(id) {
  await page.waitForFunction((nodeId) => {
    const node = document.querySelector(`[data-knowledge-node="${nodeId}"], [data-atlas-course="${nodeId}"]`);
    const frame = node?.closest('.course-knowledge__viewport, .curriculum-atlas__viewport');
    if (!frame) return false;
    const n = node.getBoundingClientRect(), r = frame.getBoundingClientRect();
    return n.left >= r.left - 1 && n.right <= r.right + 1 && (!node.dataset.knowledgeNode || n.top >= r.top - 1 && n.bottom <= r.bottom + 1);
  }, id);
}
// Press and release at the real center: a global :active transform once moved circles away from the pointer.
async function pressStableCircle(locator) {
  await locator.scrollIntoViewIfNeeded();
  const before = await locator.boundingBox();
  await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
  await page.mouse.down();
  try {
    const pressed = await locator.boundingBox();
    assert.ok(Math.abs(before.x - pressed.x) < .1 && Math.abs(before.y - pressed.y) < .1, 'pressed circle preserves its center');
  } finally { await page.mouse.up(); }
}
page.on("pageerror", (error) => errors.push(error.message));
await page.route("**/api/**", async (route) => {
  const request = route.request(), endpoint = new URL(request.url()).pathname;
  if (request.method() !== "GET") writes.push({ method: request.method(), endpoint });
  if (endpoint === "/api/me/learning-space" && personalFails || endpoint === "/api/me/recent-resources") {
    return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ message: "QA: 个人数据尚未配置" }) });
  }
  const responses = {
    "/api/auth/me": { id: "qa-student", displayName: "示例学习者", roles: ["student"] },
    "/api/portal/home": { courses: [], workflows: [], works: [], creation: { enabled: false, models: [], quota: {} } },
    "/api/me/learning-space": { profile: { displayName: "示例学习者" }, summary: { completedLessons: 0, totalLessons: 0 }, courses: [], learningLessons: [], tasks: [], notes: [], favorites: [], works: [], workflowRuns: [] },
    "/api/health": { status: "ok" },
  };
  await route.fulfill({ contentType: "application/json", body: JSON.stringify(responses[endpoint] ?? { items: [] }) });
});
try {
  await page.goto(`${base}/my-learning`, { waitUntil: "networkidle" });
  await page.locator(".curriculum-atlas__node").first().waitFor();
  assert.equal(await page.locator(".curriculum-atlas__node").count(), 10);
  assert.equal(await page.locator(".learning-load-error").count(), 0, "generic map ignores personal API failure");
  assert.equal(await page.locator("#learning-view-content").getAttribute("aria-busy"), "false");
  assert.equal(await page.locator(".curriculum-atlas__edges > path").count(), 9);
  await page.getByLabel("图谱连线显示").selectOption("all");
  assert.equal(await page.locator(".curriculum-atlas__edges > path").count(), 13);
  assert.equal(await page.locator(".curriculum-atlas__edges > path.is-transfer").count(), 4);
  const fingerprints = new Set();
  for (const [index, course] of atlasCourses.entries()) {
    if (index === 0) await page.getByLabel("选择图谱课程").selectOption(course.id);
    else await page.getByLabel("切换课程知识图谱").selectOption(course.id);
    const expected = buildCourseGraph(course);
    assert.equal(new URL(page.url()).searchParams.get("atlasCourse"), course.id);
    assert.equal(await page.locator(".course-knowledge").getAttribute("data-course-graph"), course.id);
    assert.equal(await page.locator(".course-knowledge__heading h3").innerText(), course.title);
    assert.equal(await page.locator('.course-knowledge__node[data-kind="point"]').count(), expected.pointCount);
    assert.equal(await page.locator('.course-knowledge__node[data-kind="branch"]').count(), expected.branches.length);
    assert.equal(await page.locator('.course-knowledge__node[data-kind="practice"]').count(), expected.practices.length);
    fingerprints.add((await page.locator('.course-knowledge__node strong').allTextContents()).join("|"));
    await pressStableCircle(page.locator(`[data-knowledge-node="${expected.nodes.find((node) => node.kind === 'branch').id}"]`));
    await closeNodeDetail();
    for (const node of expected.nodes) {
      const button = page.locator(`[data-knowledge-node="${node.id}"]`);
      await button.scrollIntoViewIfNeeded();
      const scrollBefore = await page.evaluate(() => scrollY);
      await button.click();
      assert.equal(await page.locator('.course-knowledge__detail h4').innerText(), node.title);
      assert.equal(await page.locator('.course-knowledge__detail > header p').innerText(), node.summary);
      assert.ok(await page.locator('.course-knowledge__detail[open]').count(), 'details open without a page jump');
      assert.ok(Math.abs(await page.evaluate(() => scrollY) - scrollBefore) <= 1, 'opening details preserves page scroll');
      assert.ok(await page.locator('.course-knowledge__detail h4').evaluate((el) => el === document.activeElement), 'detail heading receives focus');
      assert.equal(await page.locator('.course-knowledge__node[aria-pressed="true"]').count(), 1);
      if (node.kind !== "practice") assert.equal(await page.locator('.course-knowledge__detail-grid > section').first().locator('li').count(), node.sources.length);
      else assert.match(await page.locator('.course-knowledge__detail-grid > section').first().innerText(), /不是原教材的作业要求/);
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('.course-knowledge__detail[open]').count(), 0);
      assert.ok(await button.evaluate((el) => el === document.activeElement), 'Escape returns focus to selected node');
    }
    await openSettings();
    await page.getByRole('button', { name: '重置视图', exact: true }).click();
    await page.locator('.course-knowledge__settings > summary').click();
    await page.locator('.course-knowledge').screenshot({ path: path.join(output, `${course.id}-desktop.png`) });
  }
  assert.equal(fingerprints.size, 10, "ten genuinely different sets of nodes");
  await openSettings();
  await page.getByRole("button", { name: "隐藏建议练习", exact: true }).click();
  assert.equal(await page.locator('.course-knowledge__node[data-kind="practice"]').count(), 0);
  assert.equal(await page.locator('.course-knowledge__canvas path[data-relation="practice"]').count(), 0);
  await page.getByRole("button", { name: "显示建议练习", exact: true }).click();
  await page.reload({ waitUntil: "networkidle" });
  assert.equal(await page.locator('.course-knowledge').getAttribute('data-course-graph'), 'atlas-ceramics', "reload preserves course subgraph");
  await page.getByRole('button', { name: '查看节点详情', exact: true }).click();
  await page.locator('.course-knowledge__related button').first().click();
  assert.ok(await page.locator('.course-knowledge__detail h4').evaluate((el) => el === document.activeElement));
  assert.equal(await page.locator('.course-knowledge__detail').evaluate((el) => el.scrollTop), 0, 'related node opens at its heading, not at the previous scroll position');
  await page.keyboard.press('Tab');
  assert.ok(await page.evaluate(() => document.activeElement.closest('dialog[open]') !== null), 'keyboard focus stays within the detail panel');
  await page.getByRole('button', { name: '返回图谱节点', exact: true }).click();
  assert.ok(await page.locator('.course-knowledge__node[aria-pressed="true"]').evaluate((el) => el === document.activeElement));
  await page.getByRole('button', { name: '返回十门课程总图', exact: true }).click();
  await assertNodeInFrame('atlas-ceramics');
  await page.getByLabel("搜索图谱课程或知识点").fill("能指 所指");
  assert.equal(await page.locator(".curriculum-atlas__node:not(:disabled)").count(), 1);
  assert.match(await page.locator(".curriculum-atlas__detail h3").innerText(), /符号学/);
  await page.getByRole("button", { name: "视觉表达", exact: true }).click();
  assert.equal(await page.locator(".curriculum-atlas__empty").count(), 1);
  assert.equal(await page.locator(".curriculum-atlas__detail").count(), 0);
  await page.getByRole("button", { name: "清除筛选", exact: true }).click();
  await page.locator('[data-atlas-course="atlas-thinking"]').focus();
  await page.keyboard.press("Enter");
  assert.equal(await page.locator('.course-knowledge').getAttribute('data-course-graph'), 'atlas-thinking');
  await page.getByRole('button', { name: '返回十门课程总图', exact: true }).click();
  await page.locator(".curriculum-atlas__relations").getByRole("button", { name: /设计方法与策略/ }).click();
  assert.equal(await page.getByLabel("切换课程知识图谱").inputValue(), "atlas-methods");
  assert.match(await page.locator('.course-knowledge__detail').innerText(), /代尔夫特/);
  await page.getByRole('button', { name: '返回十门课程总图', exact: true }).click();
  await page.locator(".curriculum-atlas__detail details summary").first().click();
  assert.match(await page.locator(".curriculum-atlas__detail").innerText(), /代尔夫特/);
  await page.getByRole("button", { name: "重置图谱筛选", exact: true }).click();
  for (const [width, height] of [[1440, 1080], [1280, 900], [768, 1024], [390, 844]]) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => document.fonts.ready);
    const geometry = await page.evaluate(() => {
      const canvas = document.querySelector(".curriculum-atlas__canvas").getBoundingClientRect();
      const circles = [...document.querySelectorAll(".curriculum-atlas__node")].map((node) => {
        const r = node.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height, radius: getComputedStyle(node).borderRadius,
          labelFits: [...node.querySelectorAll("strong > span, small")].every((label) => label.scrollWidth <= label.clientWidth + 1),
          inCanvas: r.left >= canvas.left && r.right <= canvas.right && r.top >= canvas.top && r.bottom <= canvas.bottom };
      });
      return { width: innerWidth, pageWidth: document.documentElement.scrollWidth, circles };
    });
    assert.ok(geometry.pageWidth <= geometry.width + 1, `${width}px has no page overflow`);
    if (width >= 1280) assert.ok(await page.locator(".curriculum-atlas__viewport").evaluate((el) => el.scrollWidth <= el.clientWidth + 1), "desktop fits the entire map");
    for (const node of geometry.circles) {
      assert.ok(Math.abs(node.width - node.height) < .1);
      assert.equal(node.radius, "50%");
      assert.equal(node.labelFits, true);
      assert.equal(node.inCanvas, true);
    }
    for (let i = 0; i < geometry.circles.length; i++) for (let j = i + 1; j < geometry.circles.length; j++) {
      const a = geometry.circles[i], b = geometry.circles[j];
      assert.ok(Math.hypot(a.x - b.x, a.y - b.y) > a.width + 12, "course circles do not overlap");
    }
    await page.locator(".curriculum-atlas").screenshot({ path: path.join(output, `atlas-${width}.png`) });
  }
  // Course diagrams have variable topology, with readable circles and in-frame scrolling.
  for (const course of atlasCourses) {
    await page.goto(`${base}${courseAtlasUrl(course.id)}`, { waitUntil: "networkidle" });
    for (const [width, height] of [[1440, 1080], [1280, 900], [768, 1024], [390, 844]]) {
      await page.setViewportSize({ width, height });
      await page.evaluate(() => document.fonts.ready);
      await assertNodeInFrame(`${course.id}:root`);
      const geometry = await page.locator('.course-knowledge__canvas').evaluate((canvas) => {
        const c = canvas.getBoundingClientRect();
        return [...canvas.querySelectorAll('.course-knowledge__node')].map((el) => {
          const r = el.getBoundingClientRect();
          return { title: el.innerText, circular: Math.abs(r.width - r.height) < .1 && getComputedStyle(el).borderRadius === '50%',
            inCanvas: r.left >= c.left - 1 && r.right <= c.right + 1 && r.top >= c.top - 1 && r.bottom <= c.bottom + 1,
            fits: el.scrollHeight <= el.clientHeight + 1 && el.scrollWidth <= el.clientWidth + 1 };
        });
      });
      for (const node of geometry) assert.ok(node.circular && node.inCanvas && node.fits, `${course.id} ${width}px: ${node.title}`);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${course.id} ${width}: no page overflow`);
      if (width === 390) {
        const target = buildCourseGraph(course).nodes.filter((n) => n.kind === 'point').at(-1);
        await page.locator(`[data-knowledge-node="${target.id}"]`).click();
        assert.equal(await page.locator('.course-knowledge__detail h4').innerText(), target.title);
        await closeNodeDetail();
      }
    }
  }
  await page.getByLabel('选择课程知识节点').selectOption('atlas-ceramics:point:experiment:2');
  assert.ok(await page.locator('.course-knowledge__viewport').evaluate((el) => el.scrollLeft > 0), 'mobile node picker reveals knowledge branch');
  assert.equal(await page.locator('.course-knowledge__detail h4').innerText(), '结果与应用');
  await page.locator('.course-knowledge').screenshot({ path: path.join(output, 'course-mobile.png') });
  await page.getByRole('button', { name: '查看节点详情', exact: true }).click();
  await page.locator('.course-knowledge__detail').screenshot({ path: path.join(output, 'detail-mobile.png') });
  await closeNodeDetail();
  await openSettings();
  await page.getByRole('button', { name: '适应宽度', exact: true }).click();
  assert.ok(Number((await page.getByLabel('图谱缩放比例').innerText()).replace('%', '')) < 80);
  assert.match(await page.locator('.course-knowledge__hint').innerText(), /全图预览/);
  await page.getByRole('button', { name: '放大图谱', exact: true }).click();
  await page.getByRole('button', { name: '重置视图', exact: true }).click();
  await assertNodeInFrame('atlas-ceramics:root');
  assert.equal(await page.getByLabel('图谱缩放比例').innerText(), '100%');
  await page.getByRole('button', { name: '知识目录', exact: true }).click();
  assert.ok(await page.locator('.course-knowledge__directory').isVisible());
  const directoryItem = page.locator('.course-knowledge__directory button').first();
  await directoryItem.click();
  assert.ok(await page.locator('.course-knowledge__detail[open]').isVisible());
  await page.keyboard.press('Escape');
  assert.ok(await directoryItem.evaluate((el) => el === document.activeElement));
  await page.getByRole('button', { name: '关系图谱', exact: true }).click();
  await page.getByRole("button", { name: /个性化图谱/ }).click();
  assert.equal(new URL(page.url()).searchParams.get("atlas"), "personal");
  await page.locator(".learning-load-error").waitFor();
  assert.ok(await page.getByRole("button", { name: /返回通用图谱/ }).isVisible());
  personalFails = false;
  await page.getByRole("button", { name: "重新加载", exact: true }).click();
  await page.locator(".knowledge-orbits__node").first().waitFor();
  assert.equal(await page.locator(".knowledge-orbits__stage").count(), 2, "original personal graph retained even when optional recent API fails");
  await page.getByRole("button", { name: /返回通用图谱/ }).click();
  await page.locator(".curriculum-atlas__node").first().waitFor();
  assert.equal(new URL(page.url()).searchParams.get("atlas"), null);
  await page.goBack();
  await page.locator(".knowledge-orbits__node").first().waitFor();
  await page.goForward();
  await page.locator(".curriculum-atlas__node").first().waitFor();
  await pressStableCircle(page.locator('[data-atlas-course="atlas-type"]'));
  assert.equal(await page.locator('.course-knowledge').getAttribute('data-course-graph'), 'atlas-type', 'mobile total-map circle opens its subgraph');
  await page.getByLabel('切换课程知识图谱').selectOption('atlas-arduino');
  await page.goBack();
  assert.equal(await page.locator('.course-knowledge').getAttribute('data-course-graph'), 'atlas-type');
  await page.goForward();
  assert.equal(await page.locator('.course-knowledge').getAttribute('data-course-graph'), 'atlas-arduino');
  await page.getByRole('button', { name: '查看节点详情', exact: true }).click();
  await page.getByRole("button", { name: "查找平台课程", exact: true }).click();
  assert.equal(new URL(page.url()).pathname, "/search");
  assert.equal(new URL(page.url()).searchParams.get("query"), "Arduino");
  await page.getByRole("button", { name: "我的学习", exact: true }).click();
  await page.locator(".curriculum-atlas__node").first().waitFor();
  for (const label of ["学习首页", "我的课程", "学习计划", "学习笔记", "收藏案例", "我的作品", "知识图谱"]) {
    await page.locator(".learning-rail nav").getByRole("button", { name: new RegExp(`^${label}`) }).click();
    assert.equal(await page.locator('.learning-rail nav button[aria-pressed="true"]').count(), 1);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  }
  assert.deepEqual(writes, [], "no API mutations");
  assert.deepEqual(errors, [], "no browser runtime errors");
  await page.goto(`${base}/my-learning?atlas=course&atlasCourse=unknown`, { waitUntil: 'networkidle' });
  assert.match(await page.locator('.curriculum-atlas__empty').innerText(), /未找到这门课程/);
  assert.equal(await page.locator('.course-knowledge').count(), 0);
  assert.equal(await page.locator('.curriculum-atlas__node').count(), 10);
  console.log("PASS: total map plus ten distinct course subgraphs, all 95 concepts and sources/tasks, circle click/keyboard/picker, four viewport sizes per course, search/reset/invalid ID, generic API isolation, personal retry/round trip, course reload/history and all learning tabs; no real API writes.");
  console.log(`Screenshots: ${output}`);
} catch (error) {
  await page.screenshot({ path: path.join(output, "failure.png"), fullPage: true });
  console.error("Browser errors:", errors);
  throw error;
} finally { await browser.close(); }
