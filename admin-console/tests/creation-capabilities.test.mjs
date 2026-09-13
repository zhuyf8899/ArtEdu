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

test("创作页绑定续写表单、键盘发送与历史文件入口", async () => {
  const source = await readFile(new URL("../src/CreationWorkspace.jsx", import.meta.url), "utf8");
  assert.ok(source.includes('<form className="creation-canvas__composer" onSubmit={send}>'));
  assert.ok(source.includes("onKeyDown={handlePromptKeyDown}"));
  assert.ok(source.includes("event.ctrlKey || event.shiftKey || event.altKey || event.metaKey"));
  assert.ok(source.includes("artifact: result?.artifact ?? null"));
  assert.ok(source.includes("creation-canvas__history"));
  assert.ok(source.includes("creation-canvas__environment"));
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

test("开启智能搜索时不强制 tool_choice，避免思考模式模型接口 400", async () => {
  const portal = await readFile(new URL("../src/Portal.jsx", import.meta.url), "utf8");
  // 当前文本模型（deepseek-flash）运行在思考模式下，DeepSeek 会直接拒绝具名
  // tool_choice 并返回 400 "Thinking mode does not support this tool_choice"。
  // 首轮调用 search_web 由 systemPrompt 明确要求，auto 下模型同样会遵守，
  // 因此这里不允许再出现对象形态的 toolChoice。
  assert.ok(!/toolChoice:\s*\{/.test(portal), "不得向模型发送对象形态的 tool_choice");
  assert.ok(portal.includes('model: { toolChoice: "auto" }'));
  assert.ok(portal.includes("首轮必须调用 search_web"), "首轮检索要求仍须由系统提示词承担");
});

test("暂停输出：中断在途请求，且不当作失败处理", async () => {
  const workspace = await readFile(new URL("../src/CreationWorkspace.jsx", import.meta.url), "utf8");
  const api = await readFile(new URL("../src/services/adminApi.js", import.meta.url), "utf8");
  const portal = await readFile(new URL("../src/Portal.jsx", import.meta.url), "utf8");
  // 每一轮生成持有自己的 AbortController：暂停只中断当前这一轮。
  assert.ok(workspace.includes("const abortRef = useRef(null)"));
  assert.ok(workspace.includes("abortRef.current?.abort()"));
  assert.ok(workspace.includes("}, controller.signal);"), "onCreate 必须收到 signal");
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
