import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AiMarkdown } from "../src/AiMarkdown.js";

const render = (text) => renderToStaticMarkup(createElement(AiMarkdown, null, text));

test("renders model Markdown as headings, emphasis, lists, tables and literal code", () => {
  const html = render('## 设计建议\n\n**重点**：留白\n\n- 课程\n- 案例\n\n| 方法 | 工具 |\n| --- | --- |\n| UI | AI |\n\n```js\nconst result = 2 ** 3;\n```');
  assert.match(html, /<h3>设计建议<\/h3>/);
  assert.match(html, /<strong>重点<\/strong>/);
  assert.match(html, /<li>课程<\/li>/);
  assert.match(html, /<table>/);
  assert.match(html, /2 \*\* 3/);
  assert.doesNotMatch(html, /\*\*重点\*\*/);
});

test("model replies cannot inject HTML, unsafe URLs or remote image loads", () => {
  const html = render('<script>alert(1)</script>\n\n[危险](javascript:alert%281%29)\n\n![参考](https://example.org/pixel.png)\n\n[资料](https://example.org/course)');
  assert.doesNotMatch(html, /<script|<img|href="javascript:/);
  assert.match(html, /href="https:\/\/example.org\/course"/);
  assert.match(html, /rel="noopener noreferrer"/);
});
