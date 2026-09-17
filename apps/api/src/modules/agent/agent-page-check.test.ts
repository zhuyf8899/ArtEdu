import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { extractPageReferences, normalizeRelative, summarizePageCheck } from "./agent-page-check";

const pageHtml = (body: string) => `<!doctype html><html><head>${body}</head><body></body></html>`;

test("抽取页面引用：区分本地、外部与绝对路径", () => {
  const references = extractPageReferences(pageHtml(`
    <link rel="stylesheet" href="assets/css/style.css" />
    <link rel="icon" href="favicon.ico" />
    <style>body{color:red}</style>
    <script src="assets/js/main.js" defer></script>
    <script>console.log('inline')</script>
    <img src="../shared/logo.png" />
    <img src="https://cdn.example.com/a.png" />
    <img src="/absolute/root.png" />
  `));
  assert.deepEqual(references.stylesheets, ["assets/css/style.css"]);
  assert.deepEqual(references.scripts, ["assets/js/main.js"]);
  assert.deepEqual(references.images, ["../shared/logo.png", "https://cdn.example.com/a.png", "/absolute/root.png"]);
  assert.deepEqual(references.external, ["https://cdn.example.com/a.png"]);
  assert.deepEqual(references.absolute, ["/absolute/root.png"]);
  assert.equal(references.inlineStyleBlocks, 1);
  assert.equal(references.inlineScriptBlocks, 1);
});

test("相对引用解析：处理 ./ 与 ../，越界返回 null", () => {
  assert.equal(normalizeRelative("galaxy-ui/", "assets/css/style.css"), "galaxy-ui/assets/css/style.css");
  assert.equal(normalizeRelative("galaxy-ui/", "./a/../b.js"), "galaxy-ui/b.js");
  assert.equal(normalizeRelative("", "index.html"), "index.html");
  assert.equal(normalizeRelative("galaxy-ui/", "../../escape.css"), null);
  assert.equal(normalizeRelative("galaxy-ui/", "#anchor"), null);
  assert.equal(normalizeRelative("galaxy-ui/", ""), null);
});

test("自检结论：必须能抓出裸 HTML、丢失的文件与外部引用", () => {
  // 没有任何样式来源 → 必然是无样式裸页面
  const bare = summarizePageCheck({ htmlBytes: 200, references: extractPageReferences(pageHtml("<h1>x</h1>")), assets: [] });
  assert.equal(bare.verdict, "fail");
  assert.ok(bare.issues.some((issue) => issue.message.includes("没有任何样式来源")));

  // 样式表路径写错 / 文件是空的
  const broken = summarizePageCheck({
    htmlBytes: 200,
    references: extractPageReferences(pageHtml('<link rel="stylesheet" href="assets/css/style.css" />')),
    assets: [{ path: "assets/css/style.css", exists: false, sizeBytes: null }],
  });
  assert.equal(broken.verdict, "fail");
  assert.ok(broken.issues.some((issue) => issue.message.includes("文件不存在")));

  const empty = summarizePageCheck({
    htmlBytes: 200,
    references: extractPageReferences(pageHtml('<link rel="stylesheet" href="style.css" />')),
    assets: [{ path: "style.css", exists: true, sizeBytes: 0 }],
  });
  assert.equal(empty.verdict, "fail");
  assert.ok(empty.issues.some((issue) => issue.message.includes("文件是空的")));

  // 外部 CDN：预览离线必然加载不到
  const external = summarizePageCheck({
    htmlBytes: 200,
    references: extractPageReferences(pageHtml('<script src="https://cdn.tailwindcss.com"></script><style>body{}</style>')),
    assets: [],
  });
  assert.equal(external.verdict, "fail");
  assert.ok(external.issues.some((issue) => issue.message.includes("外部地址")));

  // 正常页面：内联样式 + 存在的本地资源
  const healthy = summarizePageCheck({
    htmlBytes: 500,
    references: extractPageReferences(pageHtml('<style>body{background:#05060f}</style>')),
    assets: [],
  });
  assert.equal(healthy.verdict, "pass");
  assert.deepEqual(healthy.issues, []);
});

test("check_page 已注册，且系统提示要求收尾自检", async () => {
  const tools = await readFile(path.join(process.cwd(), "src", "modules", "agent", "agent-tools.ts"), "utf8");
  const harness = await readFile(path.join(process.cwd(), "src", "modules", "agent", "agent-harness.service.ts"), "utf8");
  assert.ok(tools.includes('name: "check_page"'), "工具定义必须暴露给模型");
  assert.ok(tools.includes('case "check_page"'), "工具必须真正可执行");
  assert.ok(tools.includes("summarizePageCheck"), "执行时要给出结论与问题清单");
  assert.ok(harness.includes("收尾前必须自检"), "系统提示要写明收尾自检要求");
  assert.ok(harness.includes("check_page"), "自检要求要指名这个工具");
});
