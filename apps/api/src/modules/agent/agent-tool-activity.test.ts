import assert from "node:assert/strict";
import test from "node:test";
import { describeToolCall, sanitizeToolArguments, summarizeToolResult, toolActivityLabel } from "./agent-tool-activity";

test("工具名翻译成用户能看懂的进度标签", () => {
  assert.equal(toolActivityLabel("write_workspace_files"), "写入工作区文件");
  assert.equal(toolActivityLabel("read_uploaded_file"), "读取上传文件");
  assert.equal(toolActivityLabel("generate_document"), "生成文档");
  assert.equal(toolActivityLabel("search_web"), "联网检索");
  // 未知工具也必须显示出来，否则新增工具时界面又会「悄悄结束」。
  assert.equal(toolActivityLabel("brand_new_tool"), "调用 brand_new_tool");
});

test("工具参数摘要只取用户关心的那一段", () => {
  assert.equal(describeToolCall("write_workspace_file", JSON.stringify({ path: "index.html" })), "index.html");
  assert.equal(describeToolCall("write_workspace_files", JSON.stringify({ files: [{ path: "index.html" }, { path: "style.css" }] })), "index.html、style.css");
  assert.equal(describeToolCall("write_workspace_files", JSON.stringify({ files: [{ path: "a" }, { path: "b" }, { path: "c" }, { path: "d" }] })), "a、b、c 等 4 个文件");
  assert.equal(describeToolCall("search_platform", JSON.stringify({ query: "纹样" })), "纹样");
  assert.equal(describeToolCall("generate_document", JSON.stringify({ format: "pptx" })), "格式 PPTX");
  assert.equal(describeToolCall("get_workflow_detail", JSON.stringify({ workflowId: "workflow-1" })), "workflow-1");
  // 没有可展示参数的工具返回空串，界面只显示标签。
  assert.equal(describeToolCall("list_workspace_files", "{}"), "");
  // 参数不是合法 JSON 时不抛错：这次调用本身会由工具层报失败。
  assert.equal(describeToolCall("write_workspace_file", "{not json"), "");
  assert.equal(describeToolCall("write_workspace_file", undefined), "");
  // 超长路径要截断，避免撑破聊天气泡。
  assert.ok(describeToolCall("write_workspace_file", JSON.stringify({ path: "x".repeat(200) })).length <= 80);
});

test("展开用的参数保留结构但压掉体积", () => {
  assert.equal(sanitizeToolArguments(JSON.stringify({ path: "index.html" })), '{"path":"index.html"}');
  // 写网页时 content 可能上万字符，不能整份塞进气泡和本地会话存储。
  const long = sanitizeToolArguments(JSON.stringify({ path: "index.html", content: "x".repeat(5000) }));
  assert.ok(long.includes("共 5000 字符"), long.slice(0, 120));
  assert.ok(long.length <= 701);
  // 批量写文件：只留前 8 项，并注明总数。
  const many = sanitizeToolArguments(JSON.stringify({ files: Array.from({ length: 12 }, (_, index) => ({ path: `f${index}.html` })) }));
  assert.ok(many.includes("…共 12 项"));
  assert.ok(!many.includes("f8.html"));
  // 参数不是合法 JSON 或为空时不返回垃圾内容。
  assert.equal(sanitizeToolArguments("{not json"), "");
  assert.equal(sanitizeToolArguments(undefined), "");
  assert.equal(sanitizeToolArguments("{}"), "");
});

test("结果摘要只取用户能看懂的一句，取不到就留空", () => {
  assert.equal(summarizeToolResult({ message: "已创建 3 个工作区文件。" }), "已创建 3 个工作区文件。");
  assert.equal(summarizeToolResult({ items: [1, 2, 3] }), "返回 3 项");
  assert.equal(summarizeToolResult({ status: "succeeded", document: { fileName: "课堂汇报.pptx" } }), "已生成 课堂汇报.pptx");
  assert.equal(summarizeToolResult({ workflowRun: { id: "run-1" } }), "已启动工作流");
  assert.equal(summarizeToolResult({ path: "index.html" }), "index.html");
  assert.equal(summarizeToolResult({ status: "failed" }), "执行失败");
  assert.equal(summarizeToolResult(null), "");
  assert.equal(summarizeToolResult("done"), "");
  // 过长摘要要截断，避免一行撑爆界面。
  assert.ok(summarizeToolResult({ message: "字".repeat(400) }).length <= 160);
});
