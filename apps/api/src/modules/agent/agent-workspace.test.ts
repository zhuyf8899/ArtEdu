import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { AgentWorkspaceService, normalizeWorkspaceDirectory, normalizeWorkspaceName } from "./agent-workspace.service";

const actor = (id: string) => ({ id, roles: ["student"] }) as never;

test("工作区名拒绝路径语义，只接受可读的单层目录名", () => {
  for (const invalid of ["", "   ", ".", "..", ".hidden", "a/b", "a\\b", "a:b", "a*b", "a?b"]) {
    assert.throws(() => normalizeWorkspaceName(invalid), /工作区名称/);
  }
  assert.equal(normalizeWorkspaceName("  传统纹样  "), "传统纹样");
  assert.equal(normalizeWorkspaceName("web-demo_2"), "web-demo_2");
  assert.throws(() => normalizeWorkspaceName("x".repeat(41)), /不能超过/);
});

test("工作区目录把空值当默认工作区，并拒绝越界路径", () => {
  assert.equal(normalizeWorkspaceDirectory(undefined), "");
  assert.equal(normalizeWorkspaceDirectory("."), "");
  assert.equal(normalizeWorkspaceDirectory("/"), "");
  assert.equal(normalizeWorkspaceDirectory("\\"), "");
  assert.equal(normalizeWorkspaceDirectory("web/demo"), "web/demo");
  assert.equal(normalizeWorkspaceDirectory("/web/demo/"), "web/demo");
  assert.throws(() => normalizeWorkspaceDirectory("../other"), /工作区名称/);
  assert.throws(() => normalizeWorkspaceDirectory("web/../../other"), /工作区名称/);
});

test("工作区清单始终包含默认工作区，新建后按目录出现并统计文件数", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "artedu-workspace-"));
  const previous = process.env.UPLOAD_ROOT;
  process.env.UPLOAD_ROOT = root;
  try {
    const service = new AgentWorkspaceService();
    const initial = await service.listWorkspaces(actor("user-a"));
    assert.deepEqual(initial.items.map((item) => item.directory), [""]);
    assert.equal(initial.items[0].isDefault, true);
    assert.equal(initial.items[0].fileCount, 0);

    await service.createWorkspace(actor("user-a"), "纹样项目");
    await writeFile(path.join(root, "agent-workspaces", "user-a", "纹样项目", "index.html"), "<html></html>", "utf8");

    const listed = await service.listWorkspaces(actor("user-a"));
    assert.deepEqual(listed.items.map((item) => item.directory), ["", "纹样项目"]);
    assert.equal(listed.items[1].fileCount, 1);
    assert.ok(listed.items[1].updatedAt);
  } finally {
    if (previous === undefined) delete process.env.UPLOAD_ROOT; else process.env.UPLOAD_ROOT = previous;
    await rm(root, { recursive: true, force: true });
  }
});

test("ensureWorkspace 会按需建立目录，且不同用户的工作区互相隔离", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "artedu-workspace-scope-"));
  const previous = process.env.UPLOAD_ROOT;
  process.env.UPLOAD_ROOT = root;
  try {
    const service = new AgentWorkspaceService();
    assert.equal(await service.ensureWorkspace(actor("user-a"), "web/demo"), "web/demo");
    assert.equal(await service.ensureWorkspace(actor("user-a"), ""), "");
    assert.deepEqual((await readdir(path.join(root, "agent-workspaces", "user-a"))).sort(), ["web"]);
    assert.deepEqual(await readdir(path.join(root, "agent-workspaces", "user-b")).catch(() => []), []);

    // 越界目录即使传进来也不会被创建到别的用户或工作区之外。
    await assert.rejects(service.ensureWorkspace(actor("user-a"), "../user-b"), /工作区名称/);
    assert.deepEqual(await readdir(path.join(root, "agent-workspaces")).then((items) => items.filter((item) => item === "user-b")), []);
  } finally {
    if (previous === undefined) delete process.env.UPLOAD_ROOT; else process.env.UPLOAD_ROOT = previous;
    await rm(root, { recursive: true, force: true });
  }
});
