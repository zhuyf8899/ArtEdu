import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";

const read = (relative) => readFile(new URL(relative, import.meta.url), "utf8");
const exists = async (relative) => {
  try { await access(new URL(relative, import.meta.url)); return true; } catch { return false; }
};

// 皮影实验室来自工具目录里的数据行，不再单独占一张大卡片；
// 少了独立组件，就不会再出现“皮影一种规格、其他工具另一种规格”的分叉。
test("数字皮影实验室与其他工具同属一个工具目录，没有独立大卡片", async () => {
  const portal = await read("../src/Portal.jsx");
  assert.match(portal, /section === "studio"[^\n]*<WorkflowStudio/);
  assert.doesNotMatch(portal, /PiyingToolCard/);
  assert.doesNotMatch(portal, /piying-tool\.css/);
  assert.equal(await exists("../src/PiyingToolCard.js"), false);
  assert.equal(await exists("../src/piying-tool.css"), false);
});

test("所有工具卡片走同一个组件与同一套样式", async () => {
  const studio = await read("../src/WorkflowStudio.jsx");
  assert.equal((studio.match(/function ToolDirectoryCard/g) ?? []).length, 1);
  assert.match(studio, /visibleLinks\.map\(\(tool\) => <ToolDirectoryCard/);
  assert.match(studio, /className="tool-directory__card"/);
  const css = await read("../src/styles.css");
  // 统一的卡片规格：同一层级、同一封面高度、同一编辑按钮。
  for (const rule of [
    ".tool-directory__card { border: 1px solid #e2e0da; border-radius: 16px; }",
    ".tool-directory__list { gap: 16px !important; }",
    ".tool-directory__cover { height: 142px; }",
    ".tool-directory__list--list .tool-directory__card > :is(a, .tool-directory__launch) { min-height: 100px !important;",
  ]) assert.ok(css.includes(rule), rule);
  assert.match(css, /\.tool-directory__edit:hover, \.tool-directory__edit:focus-visible/);
  assert.match(css, /@media \(max-width: 620px\)/);
});

test("工具目录的外链入口带新标签页与不传来源信息保护", async () => {
  const studio = await read("../src/WorkflowStudio.jsx");
  assert.match(studio, /target=\{external \? "_blank" : undefined\}/);
  assert.match(studio, /rel=\{external \? "noopener noreferrer" : undefined\}/);
  assert.match(studio, /referrerPolicy=\{external \? "no-referrer" : undefined\}/);
  // 皮影入口是同一条数据行：有用途说明、外部打开方式，地址固定不带参数。
  const migration = await read("../../migrations/0026_tool_directory_catalog.sql");
  assert.match(migration, /'tool-directory-piying', '灵感与素材', '数字皮影实验室', '探索数字皮影的生成、演绎与制作'/);
  assert.match(migration, /'https:\/\/piying\.woooostudio\.com\/'/);
});
