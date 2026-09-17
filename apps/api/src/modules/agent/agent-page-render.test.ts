import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { resolveWorkspaceRequest } from "./agent-page-render.service";

test("工作区静态服务只解析到工作区目录内", () => {
  const root = path.resolve("/tmp/workspace");
  assert.equal(resolveWorkspaceRequest(root, "/index.html"), path.join(root, "index.html"));
  assert.equal(resolveWorkspaceRequest(root, "/assets/css/style.css"), path.join(root, "assets", "css", "style.css"));
  assert.equal(resolveWorkspaceRequest(root, "/"), root);
  // 目录请求由调用方回退到 index.html，这里只负责解析。
  assert.equal(resolveWorkspaceRequest(root, "/demo"), path.join(root, "demo"));
  // 越界、编码异常一律拒绝，避免借用预览服务读到工作区之外的文件。
  assert.equal(resolveWorkspaceRequest(root, "/../secret.txt"), null);
  assert.equal(resolveWorkspaceRequest(root, "/assets/../../etc/passwd"), null);
  assert.equal(resolveWorkspaceRequest(root, "/%2e%2e/secret"), null);
  assert.equal(resolveWorkspaceRequest(root, "/bad%ZZ"), null);
});

test("渲染自检工具已注册，且系统提示要求收尾自检", async () => {
  const tools = await readFile(path.join(process.cwd(), "src", "modules", "agent", "agent-tools.ts"), "utf8");
  const harness = await readFile(path.join(process.cwd(), "src", "modules", "agent", "agent-harness.service.ts"), "utf8");
  const agentModule = await readFile(path.join(process.cwd(), "src", "modules", "agent", "agent.module.ts"), "utf8");

  assert.ok(tools.includes('name: "render_page_screenshot"'), "工具定义必须暴露给模型");
  assert.ok(tools.includes('case "render_page_screenshot"'), "工具必须真正可执行");
  assert.ok(tools.includes("pageRenderSchema"), "参数需要校验");
  assert.ok(harness.includes("pageRender: this.pageRender"), "执行依赖要注入渲染服务");
  assert.ok(agentModule.includes("AgentPageRenderService"), "渲染服务要注册到 AgentModule");

  // 只给工具不够：提示词必须要求"收尾前自检"，否则模型还是会直接结束。
  assert.ok(harness.includes("收尾前必须自检"), "系统提示要写明收尾自检要求");
  assert.ok(harness.includes("render_page_screenshot"), "自检要求要指名这个工具");
  assert.ok(harness.includes("CSS 规则数大于 0"), "自检要有可判定的标准");
});
