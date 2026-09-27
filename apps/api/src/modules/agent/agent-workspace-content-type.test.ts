import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { AgentWorkspaceService, workspaceContentType } from "./agent-workspace.service";
import type { Actor } from "../auth/auth.service";
import { previewCspFor, svgPreviewCsp } from "./workspace-preview-csp";

const actor: Actor = { id: "student-svg", username: "student-svg", displayName: "画图学生", accountStatus: "active", roles: ["student"] };

test("Agent 工作区的 SVG 按图片下发，而不是当纯文本", () => {
  // 早期只识别 html/css/js/json，.svg 落到 text/plain + nosniff，
  // 生成的页面里 <img src="图.svg"> 直接不渲染，看起来就是"画不出来"。
  assert.equal(workspaceContentType("assets/logo.svg"), "image/svg+xml");
  assert.equal(workspaceContentType("a/b/图标.SVG"), "image/svg+xml");
});

test("工作区常见产物的响应类型齐全", () => {
  assert.equal(workspaceContentType("index.html"), "text/html; charset=utf-8");
  assert.equal(workspaceContentType("assets/style.css"), "text/css; charset=utf-8");
  assert.equal(workspaceContentType("src/main.mjs"), "text/javascript; charset=utf-8");
  assert.equal(workspaceContentType("shot.png"), "image/png");
  assert.equal(workspaceContentType("photo.JPEG"), "image/jpeg");
  assert.equal(workspaceContentType("cover.webp"), "image/webp");
  assert.equal(workspaceContentType("fonts/noto.woff2"), "font/woff2");
  assert.equal(workspaceContentType("clip.mp4"), "video/mp4");
  assert.equal(workspaceContentType("handout.pdf"), "application/pdf");
  assert.equal(workspaceContentType("notes.md"), "text/markdown; charset=utf-8");
  // 未知扩展名继续退化为纯文本，不猜类型。
  assert.equal(workspaceContentType("data.bin"), "text/plain; charset=utf-8");
});

test("SVG 预览禁止脚本与联网，同时放行同目录资源", () => {
  const csp = svgPreviewCsp("artedu.example.edu");
  assert.ok(csp.includes("script-src 'none'"), "Agent 画的 SVG 不能执行脚本");
  assert.ok(csp.includes("connect-src 'none'"));
  assert.ok(csp.includes("default-src 'none'"));
  assert.ok(csp.includes("img-src http://artedu.example.edu:* https://artedu.example.edu:* data: blob:"));
  assert.ok(csp.includes("style-src http://artedu.example.edu:* https://artedu.example.edu:* 'unsafe-inline'"));
  assert.ok(!csp.includes("'self'"));
});

test("预览策略按 Content-Type 选择，HTML 走沙箱、图片不额外加策略", () => {
  const host = "8.212.153.167";
  assert.ok(previewCspFor("text/html; charset=utf-8", host).startsWith("sandbox allow-scripts allow-same-origin; default-src 'none'"));
  assert.ok(previewCspFor("image/svg+xml", host).includes("script-src 'none'"));
  assert.equal(previewCspFor("image/png", host), "");
  assert.equal(previewCspFor("font/woff2", host), "");
});

test("预览路由必须用 previewCspFor，不能只看 text/html", async () => {
  const controller = await readFile(path.join(process.cwd(), "src", "modules", "agent", "agent.controller.ts"), "utf8");
  assert.ok(controller.includes("previewCspFor(asset.contentType"), "预览路由必须按真实 Content-Type 选择策略");
  assert.ok(!controller.includes('if (asset.contentType.startsWith("text/html"))'), "不能退回只给 HTML 加策略的旧写法");
});

test("系统提示与工具说明都告诉模型可以画 SVG，并写明自包含要求", async () => {
  const harness = await readFile(path.join(process.cwd(), "src", "modules", "agent", "agent-harness.service.ts"), "utf8");
  const tools = await readFile(path.join(process.cwd(), "src", "modules", "agent", "agent-tools.ts"), "utf8");
  assert.ok(harness.includes(".svg"), "系统提示要给出写 .svg 的明确指引");
  assert.ok(harness.includes("自包含"), "必须写明 SVG 不能引用外部资源，否则预览里不会显示");
  assert.ok(tools.includes(".svg"), "工作区写入工具的说明要包含 SVG");
});

test("Agent 写进工作区的 SVG 真的按图片取出（写入→打开 端到端）", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "artedu-svg-"));
  const previousRoot = process.env.UPLOAD_ROOT;
  process.env.UPLOAD_ROOT = root;
  try {
    const workspace = new AgentWorkspaceService();
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" fill="#aaff00"/></svg>';
    const written = await workspace.write(actor, "site/logo.svg", svg);
    assert.equal(written.path, "site/logo.svg");
    assert.ok(written.openUrl.includes("site/logo.svg"));

    const opened = await workspace.open(actor, "site/logo.svg");
    assert.equal(opened.contentType, "image/svg+xml", "SVG 必须以图片类型下发，否则预览里画不出来");
    assert.equal(opened.fileName, "logo.svg");
    const chunks: Buffer[] = [];
    for await (const chunk of opened.stream) chunks.push(Buffer.from(chunk));
    assert.equal(Buffer.concat(chunks).toString("utf8"), svg);
  } finally {
    if (previousRoot === undefined) delete process.env.UPLOAD_ROOT;
    else process.env.UPLOAD_ROOT = previousRoot;
    await rm(root, { recursive: true, force: true });
  }
});
