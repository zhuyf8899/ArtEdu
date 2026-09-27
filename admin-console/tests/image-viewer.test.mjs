// 回归护栏：对话里的图片要"直接看得到 + 点开能滚轮缩放"，工具行要用站点页标。
// 这些行为出错时界面只会安静地少一块内容或退回默认图标，所以既测纯逻辑也盯接线。
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { faviconSourcesFor, isImageArtifact, safeImageUrl } from "../src/imageSources.js";

const read = (relative) => readFile(new URL(relative, import.meta.url), "utf8");

test("图片地址白名单只放行站内相对路径与 https 直链", () => {
  assert.equal(safeImageUrl("/api/generation-jobs/job-1/download"), "/api/generation-jobs/job-1/download");
  assert.equal(safeImageUrl("https://cdn.example.com/a.png"), "https://cdn.example.com/a.png");
  // 协议相对地址、凭据地址、其它协议一律拒绝。
  assert.equal(safeImageUrl("//evil.example.com/a.png"), "");
  assert.equal(safeImageUrl("https://user:pass@example.com/a.png"), "");
  assert.equal(safeImageUrl("http://example.com/a.png"), "");
  assert.equal(safeImageUrl("javascript:alert(1)"), "");
  assert.equal(safeImageUrl("data:image/svg+xml,<svg/>"), "");
  assert.equal(safeImageUrl(null), "");
});

test("图片产物判定：看 mimeType，再退回扩展名", () => {
  assert.equal(isImageArtifact({ mimeType: "image/png", fileName: "artedu-abcd" }), true);
  assert.equal(isImageArtifact({ fileName: "artedu-abcd.webp" }), true);
  assert.equal(isImageArtifact({ fileName: "讲义.PDF" }), false);
  assert.equal(isImageArtifact({ mimeType: "application/pdf", fileName: "讲义.pdf" }), false);
  assert.equal(isImageArtifact(null), false);
});

test("外链工具的页标按站点 favicon → 图标服务顺序回退", () => {
  const sources = faviconSourcesFor("https://www.figma.com/file/abc");
  assert.equal(sources[0], "https://www.figma.com/favicon.ico");
  assert.ok(sources[1].includes("icons.duckduckgo.com/ip3/www.figma.com.ico"));
  assert.ok(sources[2].includes("google.com/s2/favicons?domain=www.figma.com"));
  // 站内入口（课程/工作流）没有站点页标，直接用内置图标。
  assert.deepEqual(faviconSourcesFor("/learning"), []);
  assert.deepEqual(faviconSourcesFor(""), []);
});

test("对话内的图片产物直接渲染，不再只给跳转链接", async () => {
  const workspace = await read("../src/CreationWorkspace.jsx");
  assert.match(workspace, /import \{ ZoomableImage \} from "\.\/ImageLightbox\.jsx"/);
  assert.match(workspace, /\{artifactImageOf\(message\.localFile\)\}/, "气泡里要挂图片");
  assert.match(workspace, /function artifactImageOf\(file\)/);
  assert.match(workspace, /if \(!file\?\.downloadUrl \|\| isImageArtifact\(file\)\) return result\.content;/, "图片产物不再拼跳转链接");
  assert.match(workspace, /return `\$\{result\.content\}\\n\\n\[打开本次生成的 /, "文档产物仍保留下载入口");
});

test("看图浮层支持滚轮缩放、拖动平移、双击复位与 Esc 关闭", async () => {
  const lightbox = await read("../src/ImageLightbox.jsx");
  assert.match(lightbox, /export function ImageLightbox\(/);
  assert.match(lightbox, /export function ZoomableImage\(/);
  assert.match(lightbox, /createPortal\(/, "浮层要挂到 body，避免被 transform 容器限制");
  // React 的 onWheel 是被动监听，必须用原生非被动监听才能 preventDefault。
  assert.match(lightbox, /addEventListener\("wheel", onWheel, \{ passive: false \}\)/);
  assert.match(lightbox, /const MIN_SCALE = 0\.25;/);
  assert.match(lightbox, /const MAX_SCALE = 8;/);
  assert.match(lightbox, /event\.key === "Escape"/);
  assert.match(lightbox, /onDoubleClick=/);
  assert.match(lightbox, /setPointerCapture/);
  const css = await read("../src/styles.css");
  assert.match(css, /\.image-lightbox__stage img \{/);
  assert.match(css, /\.chat-image img \{/);
});

test("工作流生成的图片也用同一个看图浮层", async () => {
  const runner = await read("../src/WorkflowRunner.jsx");
  assert.match(runner, /import \{ ZoomableImage \} from "\.\/ImageLightbox\.jsx"/);
  assert.match(runner, /<ZoomableImage src=\{run\.context\.artifact\.downloadUrl\}/);
});
