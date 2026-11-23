import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { workspacePreviewCsp } from "./workspace-preview-csp";
import { WorkspacePreviewGrants } from "./workspace-preview-grants";
import type { DatabaseService } from "../database/database.service";

const prefix = "/api/agent-runs/workspace-preview-grant/" + "a".repeat(43) + "/";

test("HTML 预览使用隔离来源，单文件课件仅允许内联资源", () => {
  const csp = workspacePreviewCsp("artedu.example.edu");
  assert.ok(csp.startsWith("sandbox allow-scripts; default-src 'none'"));
  assert.ok(!csp.includes("allow-same-origin"));
  assert.ok(!csp.includes("artedu.example.edu"));
  for (const directive of ["connect-src", "form-action", "base-uri", "object-src", "frame-src"]) {
    assert.ok(csp.includes(directive + " 'none'"));
  }
});

test("多文件预览只允许本次授权路径内的资源", () => {
  const csp = workspacePreviewCsp("artedu.example.edu:8080", prefix, ["http://localhost:4173"]);
  for (const origin of ["https://artedu.example.edu:*", "http://localhost:4173"]) {
    assert.ok(csp.includes(origin + prefix));
  }
  assert.ok(!csp.includes("https://artedu.example.edu:* "));
  assert.ok(csp.split("; ").filter(directive => !directive.startsWith("frame-ancestors")).every(directive => !directive.includes("'self'")));
});

test("无效主机与非授权前缀不能进入预览策略", () => {
  for (const hostile of ['evil.com"; connect-src *; x="', "a b", "例子.中国", "evil.com/"]) {
    const csp = workspacePreviewCsp(hostile, prefix);
    assert.ok(!csp.includes(hostile));
    assert.ok(csp.includes("style-src 'unsafe-inline'"));
  }
  assert.ok(!workspacePreviewCsp("artedu.example.edu", "/api/").includes("artedu.example.edu"));
});

test("预览授权使用摘要查找，资源受签发目录和过期条件约束", async () => {
  let hash = "";
  const grants = new WorkspacePreviewGrants({ query: async (sql: string, values: string[]) => {
    if (sql.startsWith("INSERT")) hash = values[0];
    return {rows: sql.includes("SELECT") && values[0] === hash
      ? [{user_id:"owner",directory:"project"}] : []};
  } } as unknown as DatabaseService);
  const url = await grants.issue("owner", "project/index.html");
  const token = url.split("/")[4];
  assert.match(hash, /^[0-9a-f]{64}$/);
  assert.notEqual(token, hash);
  assert.deepEqual(await grants.authorize(token, "project/assets/site.css"), {id:"owner",directory:"project"});
  await assert.rejects(grants.authorize(token, "other/report.txt"), /不属于/);
  await assert.rejects(grants.authorize("b".repeat(43), "project/index.html"), /无效或过期/);
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
