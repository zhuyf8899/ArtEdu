import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { workspacePreviewCsp } from "./workspace-preview-csp";

test("预览页保留沙箱与断网限制", () => {
  const csp = workspacePreviewCsp("artedu.example.edu");
  // allow-same-origin 是必需的：没有它，文档是不透明来源，同目录 CSS/JS 会被
  // 当成跨站请求（cookie 不发送 → 401 JSON → ORB 拦截），页面永远是裸 HTML。
  assert.ok(csp.startsWith("sandbox allow-scripts allow-same-origin; default-src 'none'"));
  // 即使同源，这几条硬限制也必须保留。
  assert.ok(csp.includes("connect-src 'none'"), "生成页不得发起 fetch/XHR/WebSocket");
  assert.ok(csp.includes("form-action 'none'"));
  assert.ok(csp.includes("base-uri 'none'"));
  assert.ok(csp.includes("object-src 'none'"));
  assert.ok(csp.includes("frame-src 'none'"));
});

test("同目录资源靠显式主机名放行，而不是匹配不到任何东西的 'self'", () => {
  const csp = workspacePreviewCsp("8.212.153.167");
  // 沙箱文档是不透明来源，CSP 里的 'self' 会匹配不到任何 URL，
  // 于是 HTML 引用的同目录 CSS/JS 全被拦掉，页面只剩默认样式。
  assert.ok(!csp.includes("'self'"), "预览页的资源来源不能依赖 'self'");
  assert.ok(csp.includes("style-src http://8.212.153.167:* https://8.212.153.167:* 'unsafe-inline'"));
  assert.ok(csp.includes("script-src http://8.212.153.167:* https://8.212.153.167:* 'unsafe-inline'"));
  assert.ok(csp.includes("img-src http://8.212.153.167:* https://8.212.153.167:* data: blob:"));
});

test("反代只透传主机名时也要允许任意端口", () => {
  // nginx 用 $host 转发（不带端口），而 staging 实际访问是 :8080，所以端口必须通配。
  const csp = workspacePreviewCsp("8.212.153.167:8080");
  assert.ok(csp.includes("http://8.212.153.167:*"));
  assert.ok(csp.includes("https://8.212.153.167:*"));
});

test("Host 头不可信时退回只允许内联资源，不把原样字符串拼进响应头", () => {
  for (const hostile of ['evil.com"; connect-src *; x="', "a b", "例子.中国", "[::1]:4000", "evil.com/"]) {
    const csp = workspacePreviewCsp(hostile);
    assert.ok(!csp.includes(hostile), `不能原样回填 ${hostile}`);
    assert.ok(csp.includes("style-src 'unsafe-inline'"));
    assert.ok(csp.includes("script-src 'unsafe-inline'"));
  }
  assert.ok(workspacePreviewCsp(undefined).includes("connect-src 'none'"));
  assert.ok(workspacePreviewCsp("").includes("style-src 'unsafe-inline'"));
  // 逗号分隔的转发链只取最靠近浏览器的那一跳。
  assert.ok(workspacePreviewCsp("artedu.example.edu, inner.local").includes("http://artedu.example.edu:*"));
});

test("全局 onSend 不得覆盖路由自己声明的 CSP", async () => {
  // 曾经这里无条件重设 CSP，把预览页的策略盖成 default-src 'none'，
  // 于是页面连自己的样式表都加载不了——表现就是"生成的网页完全没有样式"。
  const main = await readFile(path.join(process.cwd(), "src", "main.ts"), "utf8");
  assert.ok(
    main.includes('if (!reply.getHeader("Content-Security-Policy"))'),
    "全局钩子只能在响应没有声明 CSP 时补默认值",
  );
  // 默认值本身也要保留，API 的普通 JSON 响应仍然是最严格的策略。
  assert.ok(main.includes('"default-src \'none\'; base-uri \'none\'; form-action \'none\'; frame-ancestors \'none\'"'));
});
