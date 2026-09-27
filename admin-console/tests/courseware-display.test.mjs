// 回归护栏：课件显示方式的约定——
// PDF 不在页面里开"窗口中的窗口"（交给浏览器自己的阅读器新标签页打开），
// 视频保持页内播放但必须能放大观看。
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const library = () => readFile(new URL("../src/LearningLibrary.jsx", import.meta.url), "utf8");

test("PDF 课件改为在新标签页用浏览器打开，不再内嵌 iframe", async () => {
  const source = await library();
  const pdfBlock = source.slice(source.indexOf('if (resource.resourceType === "pdf")'), source.indexOf("// 前端源码课件"));
  assert.ok(pdfBlock.includes('target="_blank"'), "必须在浏览器新标签页打开");
  assert.ok(pdfBlock.includes("在浏览器中打开 PDF"));
  assert.ok(pdfBlock.includes("downloadLink(\"下载 PDF\")"), "下载仍作为备选方案保留");
  assert.ok(!pdfBlock.includes("<iframe"), "PDF 不能再塞进页面里的小窗口");
  assert.ok(!source.includes("${source}#view=FitH"), "旧的页内 PDF 阅读器参数应已移除");
});

test("视频保持页内播放，并新增放大观看入口", async () => {
  const source = await library();
  assert.ok(source.includes('function VideoMaterial({ resource, source, cover, meta })'));
  assert.ok(source.includes("放大观看"));
  assert.ok(source.includes("course-material-lightbox"), "放大走浮层，而不是把整页课件换掉");
  assert.ok(source.includes('window.addEventListener("keydown", onKeyDown)'), "Esc 能退出放大观看");
  // 播放器仍然是原生控件：全屏、倍速、画中画都由浏览器提供。
  assert.ok(source.includes("<video controls"));
});

test("网页课件与 Office 课件的既有策略保持不变", async () => {
  const source = await library();
  assert.ok(source.includes('if (resource.mimeType === "text/html")'), "单文件网页课件仍在页内预览");
  assert.ok(source.includes('const OFFICE_TYPES = ["ppt", "word"]'), "Office 原件仍需下载后用本机软件打开");
});

test("?course= 的自动展开逻辑在资源库组件里，不在 SourcePreview 里", async () => {
  const source = await library();
  const sourcePreview = source.slice(source.indexOf("function SourcePreview("));
  // 曾经这个 effect 被误放进 SourcePreview：那里没有 initialCourseId/openCourse，
  // 一渲染 .css/.js 源码课件就抛 ReferenceError，整个课程详情页变白屏。
  assert.ok(!sourcePreview.includes("initialCourseId"), "SourcePreview 不能引用作用域外的 initialCourseId");
  assert.ok(!sourcePreview.includes("openCourse(initialCourseId)"));
  assert.ok(source.includes("if (initialCourseId && !selected && !loading) void openCourse(initialCourseId);"));
});

test("放大观看的 JSX 片段里不出现裸 // 注释（会被当成正文渲染出来）", async () => {
  const source = await library();
  const start = source.indexOf("function VideoMaterial(");
  const end = source.indexOf("function CourseMaterial(");
  const block = source.slice(start, end === -1 ? source.length : end);
  const returned = block.indexOf("return <>");
  assert.ok(returned !== -1);
  assert.ok(
    !/^[ \t]*\/\/.*$/m.test(block.slice(returned)),
    "JSX 子节点里的 // 注释不会被执行，而是直接渲染成可见文字",
  );
});
