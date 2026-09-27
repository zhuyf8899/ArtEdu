import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";

const read = (relative) => readFile(new URL(relative, import.meta.url), "utf8");
const exists = async (relative) => {
  try { await access(new URL(relative, import.meta.url)); return true; } catch { return false; }
};

test("设计工作台恢复独立皮影入口", async () => {
  const portal = await read("../src/Portal.jsx");
  assert.match(portal, /section === "studio"[^\n]*<PiyingToolCard\s*\/>[^\n]*<WorkflowStudio/);
  assert.match(portal, /piying-tool\.css/);
  assert.equal(await exists("../src/PiyingToolCard.js"), true);
  assert.equal(await exists("../src/piying-tool.css"), true);
  const studio = await read("../src/WorkflowStudio.jsx");
  assert.match(studio, /item\.id !== "tool-directory-piying"/);
});

test("所有其他工具与皮影工作室一样逐行展示", async () => {
  const studio = await read("../src/WorkflowStudio.jsx");
  assert.equal((studio.match(/function ToolDirectoryCard/g) ?? []).length, 1);
  assert.match(studio, /visibleLinks\.map\(\(tool\) => <ToolDirectoryCard/);
  assert.match(studio, /className="tool-directory__card"/);
  const css = await read("../src/styles.css");
  assert.match(css, /\.tool-directory__list, \.tool-directory__list--list \{ grid-template-columns: minmax\(0, 1fr\) !important/);
  assert.match(css, /\.tool-directory__view-switch \{ display: none; \}/);
  assert.match(css, /\.tool-directory__play::before \{ content: "进入工具"/);
  const piyingCss = await read("../src/piying-tool.css");
  assert.match(piyingCss, /\.piying-tool__intro/);
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
