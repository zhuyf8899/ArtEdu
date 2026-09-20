import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFile } from "node:fs/promises";
import { PiyingToolCard, PIYING_TOOL_URL } from "../src/PiyingToolCard.js";

const render = () => renderToStaticMarkup(createElement(PiyingToolCard));
test("皮影入口只链接固定 HTTPS 地址，新标签页打开且不传递来源信息", () => {
  const url = new URL(PIYING_TOOL_URL);
  assert.equal(url.href, "https://piying.woooostudio.com/");
  assert.equal(url.search, ""); assert.equal(url.username, "");
  const html = render();
  assert.match(html, /href="https:\/\/piying\.woooostudio\.com\/"/);
  assert.match(html, /target="_blank"/);
  assert.match(html, /rel="noopener noreferrer"/);
  assert.match(html, /referrerPolicy="no-referrer"/i);
  assert.doesNotMatch(html, /<iframe|<form|<img|<script/);
});
test("皮影入口说明用途、跳转行为和独立账号额度，帮助默认收起", () => {
  const html = render();
  for (const text of ["数字皮影实验室", "外部工具", "素材与模板", "插件教学", "新标签页", "不会自动同步 ArtEdu 账号、对话、作品或额度", "登录或收费"]) assert.ok(html.includes(text), text);
  assert.match(html, /<details[^>]*><summary>/);
  assert.doesNotMatch(html, /<details[^>]*\bopen(?:[ =>])/);
  assert.match(html, /aria-describedby="piying-tool-destination"/);
  assert.match(html, /id="piying-tool-destination"/);
});
test("外链入口位于设计工作台，不替换原工作流，样式包含键盘和窄屏保护", async () => {
  const portal = await readFile(new URL("../src/Portal.jsx", import.meta.url), "utf8");
  assert.match(portal, /section === "studio"[^\n]*<PiyingToolCard \/><WorkflowStudio/);
  const css = await readFile(new URL("../src/piying-tool.css", import.meta.url), "utf8");
  assert.match(css, /:focus-visible/);
  assert.match(css, /@media \(max-width: 440px\)/);
  assert.match(css, /min-height: 48px/);
});
