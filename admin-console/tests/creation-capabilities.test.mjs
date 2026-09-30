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
  assert.ok(workspace.includes("}, controller.signal, onDelta);"), "onCreate 必须同时收到 signal 与 onDelta");
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
  assert.ok(portal.includes("{ signal, onDelta }"));
});

test("创作对话页独立成屏：不显示站点导航，也不显示两侧装饰", async () => {
  const portal = await readFile(new URL("../src/Portal.jsx", import.meta.url), "utf8");
  assert.ok(portal.includes('const standalone = section === "creation"'), "对话页要单独标记");
  assert.ok(portal.includes('{!standalone && <header className="portal-topbar">'), "对话页不渲染顶部导航");
  assert.ok(!portal.includes("PortalArtRails"), "全站不再渲染两侧装饰");
  assert.ok(portal.includes('["courses", "AI 讲堂", GraduationCap]'), "课程入口与 AI 讲堂页面标题一致");
  assert.ok(portal.includes('["studio", "设计工具", Palette]'), "工作台入口命名为设计工具");
  assert.ok(portal.includes("portal-main--standalone"));
  const css = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
  assert.ok(!css.includes("portal-art-rails"), "样式表不再保留两侧装饰栏");
  // 腾出来的空间要让给对话本体：更宽的主区、更高的消息区。
  assert.ok(css.includes(".portal-main--standalone { width: min(1520px"));
  // 整屏固定、页面不滚动：消息区自己滚，输入区钉在底部（不会被移动/滚动遮住）。
  assert.ok(css.includes(".portal-shell--standalone { height: 100vh; overflow: hidden;"));
  assert.ok(css.includes(".portal-shell--standalone .creation-canvas__thread { flex: 1 1 auto; min-height: 0; max-height: none; }"));
  assert.ok(css.includes(".portal-shell--standalone .creation-canvas__composer { flex: 0 0 auto;"));
});

test("AI 讲堂与设计工具移除重复标题，同时保留课程和工具内容", async () => {
  const portal = await readFile(new URL("../src/Portal.jsx", import.meta.url), "utf8");
  const studio = await readFile(new URL("../src/WorkflowStudio.jsx", import.meta.url), "utf8");
  assert.ok(portal.includes('section !== "courses" && section !== "studio"'), "两页跳过重复的大标题区");
  assert.ok(portal.includes('{section === "courses" && <LearningLibrary'), "AI 讲堂仍加载课程目录");
  assert.ok(!portal.includes('<SectionHeading eyebrow="// RESOURCE LIBRARY"'), "AI 讲堂不再显示重复入口标题");
  assert.ok(!studio.includes("// DESIGN TOOLBOX") && !studio.includes("设计工具入口"), "设计工具区不再显示重复入口标题");
  assert.ok(studio.includes("tool-directory__actions") && studio.includes("tool-directory__list"), "保留工具浏览控制和工具卡片");
});

test("历次会话是常驻左侧栏，收起后按钮仍在", async () => {
  const css = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
  const workspace = await readFile(new URL("../src/CreationWorkspace.jsx", import.meta.url), "utf8");
  // 停靠左侧 + 宽度动画（收起时对话区顺势变宽，而不是盖在消息上）。
  assert.ok(css.includes(".portal-shell--standalone .creation-canvas__body { flex: 1 1 auto; min-height: 0; display: flex; align-items: stretch; }"));
  assert.ok(css.includes("flex: 0 0 auto; width: 292px;"));
  assert.ok(css.includes(".portal-shell--standalone .creation-canvas__body.is-history-collapsed .creation-canvas__history { width: 0;"));
  assert.ok(css.includes("transition: width .24s ease, opacity .2s ease, padding .24s ease;"));
  // 收起后必须有按钮能收回来，并记住偏好。
  assert.ok(workspace.includes("creation-canvas__history-toggle"), "表头要有会话开关按钮");
  assert.ok(workspace.includes('aria-controls="artedu-creation-history"'));
  assert.ok(workspace.includes("const [historyOpen, setHistoryOpen] = useState("));
  assert.ok(workspace.includes('localStorage.getItem("artedu-creation-history-open") !== "0"'));
  assert.ok(workspace.includes('localStorage.setItem("artedu-creation-history-open"'));
});

test("进入对话一定停在最新消息处，不因滚动保护而停在顶部", async () => {
  const workspace = await readFile(new URL("../src/CreationWorkspace.jsx", import.meta.url), "utf8");
  assert.ok(workspace.includes("const jumpToBottomRef = useRef(false);"), "要有强制到底的标记");
  assert.ok(workspace.includes("jumpToBottomRef.current = true;"), "载入/发送时置位");
  assert.ok(workspace.includes("if (!force && node.scrollHeight - node.scrollTop - node.clientHeight > 160) return;"));
});

test("「重新输出」清除上一轮回复后重新生成，而不是回填输入框", async () => {
  const workspace = await readFile(new URL("../src/CreationWorkspace.jsx", import.meta.url), "utf8");
  assert.ok(workspace.includes("baseMessages: messages.slice(0, Math.max(0, index - 1))"), "必须截断到该提问之前");
  assert.ok(workspace.includes('onNotice?.("已清除上一轮输出，正在重新生成…", "success")'));
  assert.ok(!workspace.includes("已将本轮问题带回输入框"), "旧的一次性回填行为应已移除");
});

test("工作区预览页能加载同目录资源，并明确禁止外部 CDN", async () => {
  const controller = await readFile(new URL("../../apps/api/src/modules/agent/agent.controller.ts", import.meta.url), "utf8");
  const harness = await readFile(new URL("../../apps/api/src/modules/agent/agent-harness.service.ts", import.meta.url), "utf8");
  const csp = await readFile(new URL("../../apps/api/src/modules/agent/workspace-preview-csp.ts", import.meta.url), "utf8");

  // 控制器必须按真实 Content-Type 选策略（HTML 沙箱、SVG 禁脚本），不能退回内联写死的一段 CSP。
  assert.ok(controller.includes('previewCspFor(asset.contentType, request.headers["x-forwarded-host"] ?? request.headers.host)'));
  assert.ok(!controller.includes("default-src 'self'"), "沙箱文档是不透明来源，'self' 什么都匹配不到");
  // allow-same-origin 是必需的：缺了它，同目录 CSS/JS 会被当成跨站请求
  // （cookie 不发送 → 401 JSON → ORB 拦截），页面永远是裸 HTML。
  assert.ok(csp.includes("sandbox allow-scripts allow-same-origin"));
  assert.ok(csp.includes("connect-src 'none'"), "同源也不代表可以联网");
  assert.ok(csp.includes("form-action 'none'"));

  // 模型必须知道预览页离线：否则它照样会写 Tailwind CDN，页面还是裸 HTML。
  assert.ok(harness.includes("绝对不能引用外部 CDN"), "系统提示要说明预览环境禁止外部资源");
});
