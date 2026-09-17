import assert from "node:assert/strict";
import test from "node:test";
import { describeToolCall, toolActivityLabel } from "./agent-tool-activity";

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
