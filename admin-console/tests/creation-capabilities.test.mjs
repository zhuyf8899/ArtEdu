import assert from "node:assert/strict";
import test from "node:test";
import { supportsCreationMethod } from "../src/creation-capabilities.js";
import { buildCreationParameters, creationMethod, normalizePageCount, resolveCreationOperation } from "../src/creationMethods.js";
import { readFile } from "node:fs/promises";

test("document generation requires explicit document capability, not just chat", () => {
  assert.equal(supportsCreationMethod({ capabilities: ["chat"] }, "document"), false);
  assert.equal(supportsCreationMethod({ capabilities: ["chat", "document"] }, "document"), true);
  assert.equal(supportsCreationMethod(undefined, "document"), false);
  assert.equal(supportsCreationMethod({ capabilities: "document" }, "document"), false);
});

test("PPT 页数传入请求且 PDF 不携带课件页数", () => {
  assert.equal(buildCreationParameters({ methodId: "slides", pageCount: "3" }).pageCount, 3);
  assert.equal(buildCreationParameters({ methodId: "pdf", pageCount: "3" }).pageCount, undefined);
  assert.equal(buildCreationParameters({ methodId: "chat", advisoryMethodId: "ui" }).advisoryMode, "ui");
  assert.equal(creationMethod("pdf").outputFormat, "pdf");
  assert.equal(normalizePageCount("99"), "");
});

test("建议模式不强制执行操作，只有显式产物意图才切换通道", () => {
  assert.equal(resolveCreationOperation("讲讲宋代山水画的构图特点", "ui").jobType, "chat");
  assert.equal(resolveCreationOperation("生成一张蓝绿色连续平铺纹样", "chat").jobType, "pattern");
  assert.equal(resolveCreationOperation("生成一个学生作品画廊网页原型", "chat").jobType, "webpage");
  assert.equal(resolveCreationOperation("生成一份 8 页 PPT 课堂汇报", "chat").id, "slides");
});

test("创作页绑定续写表单、键盘发送、历史文件留存与消息操作", async () => {
  const source = await readFile(new URL("../src/CreationWorkspace.jsx", import.meta.url), "utf8");
  assert.ok(source.includes('<form className="creation-canvas__composer" onSubmit={send}>'));
  assert.ok(source.includes("onKeyDown={handlePromptKeyDown}"));
  assert.ok(source.includes("event.ctrlKey || event.shiftKey || event.altKey || event.metaKey"));
  assert.ok(source.includes("downloadUrl: uploaded.downloadUrl"), "上传引用必须把私有文件地址写入本地会话");
  assert.ok(source.includes("creation-canvas__history-menu-toggle"), "每个会话应有独立的更多操作入口");
  assert.ok(!source.includes("ArtifactBlock"), "对话中不应再提供下载产物按钮");
  assert.ok(source.includes("creation-canvas__history"));
  assert.ok(!source.includes('aria-label="本轮 Agent 环境"'));
  assert.ok(source.includes("copyReply"));
  assert.ok(source.includes("retryReply"));
  assert.ok(source.includes("editPrompt"));
  assert.ok(source.includes("resolveCreationOperation(content, methodId)"));
});

test("普通问答具备显式 Agent 场景，未知任务不会回退到 UI 创作", async () => {
  const portal = await readFile(new URL("../src/Portal.jsx", import.meta.url), "utf8");
  const contracts = await readFile(new URL("../../apps/api/src/modules/agent/agent.contracts.ts", import.meta.url), "utf8");
  assert.ok(portal.includes('const agentScenarios = { chat: "chat"'));
  assert.ok(portal.includes('if (!artifactJobTypes.has(jobType)) throw new Error("不支持的创作类型，已阻止执行")'));
  assert.ok(!portal.includes('document_generation" }[jobType] ?? "ui_design"'));
  assert.ok(contracts.includes('"chat", "ui_design"'));
});

test("开启智能搜索时不强制 tool_choice，且不把检索当成默认动作", async () => {
  const portal = await readFile(new URL("../src/Portal.jsx", import.meta.url), "utf8");
  // 当前文本模型（deepseek-flash）运行在思考模式下，DeepSeek 会直接拒绝具名
  // tool_choice 并返回 400 "Thinking mode does not support this tool_choice"。
  // 保持 auto，具体是否检索由用户需求决定，而不是强制第一轮调用。
  assert.ok(!/toolChoice:\s*\{/.test(portal), "不得向模型发送对象形态的 tool_choice");
  assert.ok(portal.includes('model: { toolChoice: "auto" }'));
  assert.ok(portal.includes("仅当用户明确要求实时互联网资料"));
  assert.ok(!portal.includes("promptWithSearchPolicy"), "系统策略不得污染用户原始提示词");
  assert.ok(!portal.includes("首轮必须调用 search_web"));
});

test("暂停输出：中断在途请求，且不当作失败处理", async () => {
  const workspace = await readFile(new URL("../src/CreationWorkspace.jsx", import.meta.url), "utf8");
  const api = await readFile(new URL("../src/services/adminApi.js", import.meta.url), "utf8");
  const portal = await readFile(new URL("../src/Portal.jsx", import.meta.url), "utf8");
  // 每一轮生成持有自己的 AbortController：暂停只中断当前这一轮。
  assert.ok(workspace.includes("const abortRef = useRef(null)"));
  assert.ok(workspace.includes("abortRef.current?.abort()"));
  // 生成入口把 signal 与增量回调一起交给 onCreate：前者用于暂停，后者用于流式回填。
  assert.ok(workspace.includes("}, controller.signal, onDelta, onToolCall);"), "onCreate 必须同时收到 signal、正文增量与工具进度回调");
  // 暂停走独立分支：保留内容、回填输入，而不是走失败态。
  assert.ok(workspace.includes('if (error?.name === "AbortError")'));
  assert.ok(workspace.includes("settlePaused"));
  assert.ok(workspace.includes("paused: true"));
  // 生成过程中必须看得到暂停入口。
  assert.ok(workspace.includes('className="ai-pause"'));
  assert.ok(workspace.includes("暂停输出"));
  // AbortError 不能被 request() 吞成「无法连接服务」，否则暂停会显示成网络故障。
  assert.ok(api.includes('if (error?.name === "AbortError") throw error;'));
  assert.ok(api.includes("signal: options.signal"));
  // 暂停是用户主动行为，不该弹错误提示。
  assert.ok(portal.includes('if (error?.name === "AbortError") throw error;'));
});

test("联网检索来源以引用卡片渲染，且复用同一套 URL 安全规则", async () => {
  const workspace = await readFile(new URL("../src/CreationWorkspace.jsx", import.meta.url), "utf8");
  const portal = await readFile(new URL("../src/Portal.jsx", import.meta.url), "utf8");
  const markdown = await readFile(new URL("../src/AiMarkdown.js", import.meta.url), "utf8");
  // 来源取自本轮 run 的工具调用记录，并挂到助手消息上（run 与 send 两条路径）。
  assert.ok(portal.includes("searchSourcesFromRun(completed.toolCalls)"));
  assert.ok(portal.includes("if (call?.toolName !== \"search_web\") continue;"));
  assert.ok(workspace.includes("sources: result?.sources ?? null"));
  // 卡片必须复用与模型回复相同的 URL 安全规则，不能另起一套。
  assert.ok(workspace.includes('import { AiMarkdown, safeReplyUrl } from "./AiMarkdown.js"'));
  assert.ok(markdown.includes("export function safeReplyUrl"));
  assert.ok(workspace.includes('safeReplyUrl(String(source?.url ?? ""))'));
  assert.ok(workspace.includes('className="ai-sources"'));
  // 没有可用来源时整块不渲染，不留空壳占位。
  assert.ok(workspace.includes("if (!safe.length) return null"));
});

test("流式输出：前端走 SSE 增量渲染，并在 done 后落到同一条消息", async () => {
  const workspace = await readFile(new URL("../src/CreationWorkspace.jsx", import.meta.url), "utf8");
  const api = await readFile(new URL("../src/services/adminApi.js", import.meta.url), "utf8");
  const portal = await readFile(new URL("../src/Portal.jsx", import.meta.url), "utf8");

  // API 层：新增流式入口，逐帧解析 SSE，且服务端不支持时能退回一次性调用。
  assert.ok(api.includes("export const executeAgentRunStream"));
  assert.ok(api.includes("/execute-stream"));
  assert.ok(api.includes('"text/event-stream"'));
  assert.ok(api.includes('event === "delta"'));
  assert.ok(api.includes('event === "done"'));
  assert.ok(api.includes("return executeAgentRun(runId, input, { signal })"), "不支持流式时必须回退到老接口");

  // 创作页：增量回填到最后一个气泡，气泡带 streaming 标记（CSS 光标据此显示）。
  assert.ok(workspace.includes("const onDelta = (text) => {"));
  assert.ok(workspace.includes("streaming: true"));
  assert.ok(workspace.includes("ai-message--streaming"));
  assert.ok(workspace.includes("message.content || message.placeholder"), "没有增量时仍显示占位文案");

  // 门户：agent 分支必须走流式入口，并透传增量回调。
  assert.ok(portal.includes("executeAgentRunStream(run.id"));
  assert.ok(portal.includes("{ signal, onDelta, onToolCall }"));
});

test("「重新输出」清除上一轮回复后重新生成，而不是回填输入框", async () => {
  const workspace = await readFile(new URL("../src/CreationWorkspace.jsx", import.meta.url), "utf8");
  assert.ok(workspace.includes("baseMessages: messages.slice(0, Math.max(0, index - 1))"), "必须截断到该提问之前");
  assert.ok(workspace.includes('onNotice?.("已清除上一轮输出，正在重新生成…", "success")'));
  assert.ok(!workspace.includes("已将本轮问题带回输入框"), "旧的一次性回填行为应已移除");
});

test("工具调用与写文件过程实时显示，而不是直接结束", async () => {
  const workspace = await readFile(new URL("../src/CreationWorkspace.jsx", import.meta.url), "utf8");
  const api = await readFile(new URL("../src/services/adminApi.js", import.meta.url), "utf8");
  const css = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
  const harness = await readFile(new URL("../../apps/api/src/modules/agent/agent-harness.service.ts", import.meta.url), "utf8");
  const controller = await readFile(new URL("../../apps/api/src/modules/agent/agent.controller.ts", import.meta.url), "utf8");
  const portal = await readFile(new URL("../src/Portal.jsx", import.meta.url), "utf8");

  // 回调必须一路透传：创作页 → 门户 → 流式执行，中间断一层界面就又没有进度了。
  assert.ok(portal.includes("context, signal, onDelta, onToolCall)"), "startGeneration 要接收工具进度回调");
  assert.ok(portal.includes("}, { signal, onDelta, onToolCall });"), "流式执行要带上工具进度回调");

  // 服务端在工具开始/成功/失败时都要广播：少任何一种，界面就会一直停在「进行中」。
  assert.ok(harness.includes('emitToolActivity(call, "start")'));
  assert.ok(harness.includes('emitToolActivity(call, "end", { status: "succeeded"'));
  assert.ok(harness.includes('emitToolActivity(call, "end", { status: "failed"'));
  assert.ok(harness.includes("call.function.name === harnessProbeTool.function.name) return"), "内部探针不该出现在用户可见记录里");
  assert.ok(controller.includes('onToolCall: (activity) => send("tool", activity)'));

  // SSE 解析出 tool 事件并交给回调，回调一路传到生成请求。
  assert.ok(api.includes("const { onDelta, onToolCall, signal } = options;"));
  assert.ok(api.includes('else if (event === "tool" && payload?.id) onToolCall?.(payload);'));
  assert.ok(workspace.includes("}, controller.signal, onDelta, onToolCall);"), "onCreate 必须同时收到工具进度回调");

  // 服务端的开始/结束事件映射成运行中/成功/失败三种状态。
  assert.ok(workspace.includes('status: activity.phase !== "end" ? "running"'));
  assert.ok(workspace.includes('activity.status === "failed" ? "failed" : "succeeded"'));

  // 气泡里渲染工具列表，并且三种状态各有图标。
  assert.ok(workspace.includes("<ToolActivityList tools={message.tools} />"));
  assert.ok(workspace.includes('className="ai-tools"'));
  assert.ok(workspace.includes("SpinnerGap"), "进行中的工具要有转圈图标");
  assert.ok(workspace.includes("WarningCircle"), "失败的工具要有提示图标");
  assert.ok(css.includes(".ai-tools__item"));

  // 工具记录随正文一起落库：重开对话、暂停、失败都要保留，不能只活在内存里。
  assert.ok(workspace.includes("const tools = rendered[rendered.length - 1]?.tools ?? [];"));
  assert.ok(workspace.includes("tools: streaming[streaming.length - 1]?.tools ?? []"), "暂停时要保留工具记录");
  assert.ok(workspace.includes("failed: true, tools: rendered[rendered.length - 1]?.tools ?? []"), "失败时要保留工具记录");
});

test("工具调用记录可展开查看真实工具名、参数与结果", async () => {
  const workspace = await readFile(new URL("../src/CreationWorkspace.jsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
  const harness = await readFile(new URL("../../apps/api/src/modules/agent/agent-harness.service.ts", import.meta.url), "utf8");
  const activity = await readFile(new URL("../../apps/api/src/modules/agent/agent-tool-activity.ts", import.meta.url), "utf8");

  // 服务端在事件里带上参数、结果与耗时，而不只是一句中文说明。
  assert.ok(harness.includes("sanitizeToolArguments(call.function.arguments)"));
  assert.ok(harness.includes("result: summarizeToolResult(output)"));
  assert.ok(harness.includes("durationMs: Date.now() - startedAt"));
  assert.ok(activity.includes("export function sanitizeToolArguments"));
  assert.ok(activity.includes("export function summarizeToolResult"));

  // 展开内容：真实工具名、参数、结果三行，参数超长时由服务端压缩。
  assert.ok(workspace.includes("<details>"));
  assert.ok(workspace.includes("<summary>"));
  assert.ok(workspace.includes("<span>工具</span><code>{tool.name}</code>"));
  assert.ok(workspace.includes("<span>参数</span><code>{tool.arguments}</code>"));
  assert.ok(workspace.includes("<span>结果</span><code>{tool.result}</code>"));
  assert.ok(workspace.includes("arguments: typeof activity.arguments === \"string\""), "前端要接住参数");
  assert.ok(workspace.includes("durationMs: Number.isFinite(activity.durationMs)"), "前端要接住耗时");
  assert.ok(workspace.includes("formatDuration(tool.durationMs)"));

  // 折叠态的样式与展开箭头。
  assert.ok(css.includes(".ai-tools__body"));
  assert.ok(css.includes(".ai-tools__item summary::-webkit-details-marker"));
  assert.ok(css.includes(".ai-tools__caret"));
});
