import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";

const read = (relative) => readFile(new URL(relative, import.meta.url), "utf8");
const exists = async (relative) => {
  try { await access(new URL(relative, import.meta.url)); return true; } catch { return false; }
};

test("皮影不再单独占一张大卡，而是跟其他工具同列", async () => {
  const portal = await read("../src/Portal.jsx");
  // 工作台只挂工作流工作台本体：皮影入口由工具目录的数据行承担。
  assert.match(portal, /section === "studio" && <WorkflowStudio/);
  assert.ok(!portal.includes("<PiyingToolCard"), "不再有独立的皮影卡片");
  assert.ok(!portal.includes("piying-tool.css"));
  assert.equal(await exists("../src/PiyingToolCard.js"), false);
  assert.equal(await exists("../src/piying-tool.css"), false);
  const studio = await read("../src/WorkflowStudio.jsx");
  assert.ok(!studio.includes('item.id !== "tool-directory-piying"'), "皮影不能再被从列表里过滤掉");
  assert.match(studio, /links\.filter\(\(item\) => item\.status === "active"/);
});

test("所有工具（含皮影）逐行展示", async () => {
  const studio = await read("../src/WorkflowStudio.jsx");
  assert.equal((studio.match(/function ToolDirectoryCard/g) ?? []).length, 1);
  assert.match(studio, /visibleLinks\.map\(\(tool\) => <ToolDirectoryCard/);
  assert.match(studio, /className="tool-directory__card"/);
  const css = await read("../src/styles.css");
  assert.match(css, /\.tool-directory__list, \.tool-directory__list--list \{ grid-template-columns: minmax\(0, 1fr\) !important/);
  assert.match(css, /\.tool-directory__view-switch \{ display: none; \}/);
  assert.match(css, /\.tool-directory__play::before \{ content: "进入工具"/);
  assert.match(css, /\.tool-directory__edit:hover, \.tool-directory__edit:focus-visible/);
  assert.match(css, /@media \(max-width: 620px\)/);
});

test("外链工具用目标站点自己的页标，并按顺序回退到内置图标", async () => {
  const studio = await read("../src/WorkflowStudio.jsx");
  assert.match(studio, /function ToolSiteIcon\(\{ href, fallback \}\)/);
  assert.match(studio, /const sources = useMemo\(\(\) => faviconSourcesFor\(href\), \[href\]\)/, "页标候选来自纯逻辑模块");
  assert.match(studio, /onError=\{\(\) => setIndex\(\(value\) => value \+ 1\)\}/, "失败要往下换一个来源");
  assert.match(studio, /if \(!sources\.length \|\| index >= sources\.length\) return fallback;/, "全部失败才用内置图标");
  assert.match(studio, /<ToolSiteIcon href=\{tool\.href\} fallback=\{<Icon size=\{25\} weight="duotone" \/>\} \/>/);
  const css = await read("../src/styles.css");
  assert.match(css, /\.tool-directory__favicon \{/);
  // 具体候选顺序在纯逻辑模块里有断言（tests/image-viewer.test.mjs）。
  const sources = await read("../src/imageSources.js");
  assert.match(sources, /favicon\.ico/);
  assert.match(sources, /icons\.duckduckgo\.com\/ip3\//);
  assert.match(sources, /google\.com\/s2\/favicons\?domain=/);
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
