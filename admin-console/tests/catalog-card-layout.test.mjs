import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const styles = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
const learning = await readFile(new URL("../src/MyLearning.jsx", import.meta.url), "utf8");

test("四个模块共用卡片边界及键盘焦点样式，不改变原有网格布局", () => {
  for (const selector of [".learning-space--horizontal .my-course-card", ".course-grid > .course-card", ".work-grid > .work-card", ".workflow-catalog > .tool-directory .tool-directory__card", ".workflow-catalog .workflow-card"]) {
    assert.ok(styles.includes(`${selector}:focus-within`), `${selector} needs visible keyboard focus`);
  }
  assert.match(styles, /border: 1px solid var\(--catalog-card-border\)/);
  assert.match(styles, /outline: 2px solid var\(--catalog-card-focus\)/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
});

test("我的课程封面与简介分区，状态来自真实进度，不伪造掌握程度", () => {
  assert.match(learning, /className="my-course-card__cover"/);
  assert.match(learning, /<CourseStatusBadge course=\{course\} \/>/);
  assert.match(learning, /const completed = course\.progressPercent >= 100/);
  assert.match(learning, /const started = course\.progressPercent > 0 \|\| course\.completedLessons > 0/);
  assert.match(styles, /\.my-course-card__cover[\s\S]*border-bottom: 1px solid var\(--catalog-card-divider\)/);
});

test("讲堂封面小屏切为下边界，社区与课程操作区保留分隔线", () => {
  assert.match(styles, /@media \(max-width: 560px\) \{\s*\.course-grid \.course-cover \{ border-right: 0; border-bottom: 1px solid var\(--catalog-card-divider\)/);
  assert.match(styles, /\.work-grid > \.work-card \.work-card__footer \{[^}]*border-top-color: var\(--catalog-card-divider\)/);
  assert.match(styles, /\.learning-space--horizontal \.my-course-card footer,[\s\S]*?border-top: 1px solid var\(--catalog-card-divider\)/);
});
