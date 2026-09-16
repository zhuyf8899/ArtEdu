import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { createReadStream } from "node:fs";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { getEnvironment } from "../../common/environment";
import type { Actor } from "../auth/auth.service";

const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_LIST_ITEMS = 200;
const MAX_BATCH_FILES = 30;
const MAX_BATCH_BYTES = 4 * 1024 * 1024;
const MAX_WORKSPACE_NAME_LENGTH = 40;
const MAX_WORKSPACE_ITEMS = 50;

/**
 * 工作区名会同时作为目录名和界面标签，因此只允许单层、可读、无路径语义的名字。
 * 拒绝 `.`/`..`、以点开头的名字、路径分隔符和 Windows 保留字符，避免它变成路径。
 */
export function normalizeWorkspaceName(value: unknown): string {
  const name = String(value ?? "").trim();
  if (!name) throw new ForbiddenException("工作区名称不能为空");
  if (name.length > MAX_WORKSPACE_NAME_LENGTH) throw new ForbiddenException(`工作区名称不能超过 ${MAX_WORKSPACE_NAME_LENGTH} 个字符`);
  if (name === "." || name === ".." || name.startsWith(".")) throw new ForbiddenException("工作区名称不能以点开头");
  // eslint-disable-next-line no-control-regex
  if (/[/\\:*?"<>|\u0000-\u001f]/.test(name)) throw new ForbiddenException("工作区名称不能包含路径分隔符或特殊字符");
  return name;
}

/**
 * 工作区目录：空值代表工作区根目录（默认工作区），其余按 `/` 分层后逐段校验。
 * 与文件路径的区别在于这里逐段套用更严的工作区命名规则。
 */
export function normalizeWorkspaceDirectory(value: unknown): string {
  const normalized = String(value ?? "").replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+$/, "");
  if (!normalized || normalized === ".") return "";
  return normalized.split("/").map((part) => normalizeWorkspaceName(part)).join("/");
}

/**
 * 每位用户拥有独立 Agent 工作区。路径永远相对该目录解析，因而 Agent 能管理
 * 自己的文件，却无法借由 ../ 或符号路径触及服务程序、其他用户或环境变量。
 */
@Injectable()
export class AgentWorkspaceService {
  private root(actor: Actor) { return path.resolve(getEnvironment().uploadRoot, "agent-workspaces", actor.id); }

  /**
   * 对话按工作区分组，所以界面需要一份"我有哪些工作区、各自有多少文件"的清单。
   * 默认工作区就是根目录本身，始终存在，排在第一位。
   */
  async listWorkspaces(actor: Actor) {
    const root = this.root(actor);
    await mkdir(root, { recursive: true, mode: 0o700 });
    const entries = await readdir(root, { withFileTypes: true });
    const directories = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort((a, b) => a.localeCompare(b, "zh-CN"));
    const items = [{ directory: "", name: "默认工作区", isDefault: true, ...(await this.summary(root)) }];
    for (const name of directories.slice(0, MAX_WORKSPACE_ITEMS)) {
      // 目录名可能是历史遗留或外部写入的，无法通过命名校验时也不能让整个清单失败。
      if (name.startsWith(".")) continue;
      items.push({ directory: name, name, isDefault: false, ...(await this.summary(path.join(root, name))) });
    }
    return { items };
  }

  async createWorkspace(actor: Actor, name: unknown) {
    const directory = normalizeWorkspaceName(name);
    const target = this.resolve(actor, directory);
    await mkdir(target, { recursive: true, mode: 0o700 });
    return { directory, name: directory, isDefault: false, ...(await this.summary(target)) };
  }

  /**
   * 一次对话只能在自己的工作区里读写文件：这里把模型传来的目录规范化后确保存在，
   * 返回值会被写进系统提示，避免不同工作区的成果混在一起。
   */
  async ensureWorkspace(actor: Actor, directory: unknown) {
    const relative = normalizeWorkspaceDirectory(directory);
    if (relative) await mkdir(this.resolve(actor, relative), { recursive: true, mode: 0o700 });
    return relative;
  }

  private async summary(target: string) {
    const entries = await readdir(target, { withFileTypes: true }).catch(() => []);
    let fileCount = 0;
    let updatedAt: Date | null = null;
    for (const entry of entries.slice(0, MAX_LIST_ITEMS)) {
      const info = await stat(path.join(target, entry.name)).catch(() => null);
      if (!info) continue;
      if (entry.isFile()) fileCount += 1;
      if (!updatedAt || info.mtime > updatedAt) updatedAt = info.mtime;
    }
    return { fileCount, directoryCount: entries.filter((entry) => entry.isDirectory()).length, updatedAt: updatedAt ? updatedAt.toISOString() : null };
  }

  async list(actor: Actor, directory = ".") {
    const relative = this.relative(directory);
    const target = this.resolve(actor, relative);
    await mkdir(target, { recursive: true, mode: 0o700 });
    const entries = await readdir(target, { withFileTypes: true });
    return {
      directory: relative || ".",
      items: (await Promise.all(entries.slice(0, MAX_LIST_ITEMS).map(async (entry) => {
        const info = await stat(path.join(target, entry.name));
        return { name: entry.name, path: relative ? `${relative}/${entry.name}` : entry.name, kind: entry.isDirectory() ? "directory" : "file", sizeBytes: info.size, updatedAt: info.mtime.toISOString() };
      }))).sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name)),
    };
  }

  async changeDirectory(actor: Actor, directory: string) {
    const relative = this.relative(directory);
    const target = this.resolve(actor, relative);
    const info = await stat(target).catch(() => null);
    if (!info?.isDirectory()) throw new NotFoundException("工作区目录不存在");
    return { directory: relative || ".", message: "工作目录已切换；后续工具请以该目录作为 directory 或 path 前缀。" };
  }

  async read(actor: Actor, filePath: string) {
    const target = this.resolve(actor, this.relative(filePath));
    const info = await stat(target).catch(() => null);
    if (!info?.isFile()) throw new NotFoundException("工作区文件不存在");
    if (info.size > MAX_FILE_BYTES) throw new ForbiddenException("工作区文件超过 2 MB，不能直接读取");
    return { path: this.relative(filePath), content: (await readFile(target, "utf8")).slice(0, 120000), sizeBytes: info.size };
  }

  async write(actor: Actor, filePath: string, content: string) {
    const relative = this.relative(filePath);
    if (!relative) throw new ForbiddenException("不能写入工作区根目录");
    const target = this.resolve(actor, relative);
    if (Buffer.byteLength(content, "utf8") > MAX_FILE_BYTES) throw new ForbiddenException("工作区单个文件不能超过 2 MB");
    await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
    await writeFile(target, content, { encoding: "utf8", mode: 0o600 });
    return { path: relative, sizeBytes: Buffer.byteLength(content, "utf8"), openUrl: this.openUrl(relative) };
  }

  async createDirectory(actor: Actor, directory: string) {
    const relative = this.relative(directory);
    if (!relative) throw new ForbiddenException("不能重复创建工作区根目录");
    await mkdir(this.resolve(actor, relative), { recursive: true, mode: 0o700 });
    return { directory: relative, message: "工作区目录已创建。" };
  }

  /** 一次创建一组相互引用的文件，适合 index.html + CSS + JS 等网页项目。 */
  async writeMany(actor: Actor, files: Array<{ path: string; content: string }>) {
    if (!files.length || files.length > MAX_BATCH_FILES) throw new ForbiddenException(`一次最多创建 ${MAX_BATCH_FILES} 个工作区文件`);
    const normalized = files.map((file) => ({ path: this.relative(file.path), content: file.content }));
    if (normalized.some((file) => !file.path)) throw new ForbiddenException("不能写入工作区根目录");
    if (new Set(normalized.map((file) => file.path)).size !== normalized.length) throw new ForbiddenException("批量写入中存在重复文件路径");
    const totalBytes = normalized.reduce((total, file) => total + Buffer.byteLength(file.content, "utf8"), 0);
    if (totalBytes > MAX_BATCH_BYTES) throw new ForbiddenException("一次批量写入不能超过 4 MB");
    if (normalized.some((file) => Buffer.byteLength(file.content, "utf8") > MAX_FILE_BYTES)) throw new ForbiddenException("工作区单个文件不能超过 2 MB");
    const written = [];
    for (const file of normalized) written.push(await this.write(actor, file.path, file.content));
    return { items: written, message: `已创建 ${written.length} 个工作区文件。` };
  }

  async open(actor: Actor, filePath: string) {
    const relative = this.relative(filePath);
    const target = this.resolve(actor, relative);
    const info = await stat(target).catch(() => null);
    if (!info?.isFile()) throw new NotFoundException("工作区文件不存在");
    return { path: relative, stream: createReadStream(target), contentType: contentType(relative), fileName: path.basename(relative) };
  }

  /**
   * 使用目录型 URL 托管预览文件。浏览器由此会把 `assets/style.css`、`src/main.js`
   * 解析到同一工作区目录，而不是错误地解析到 /api/agent-runs/ 下。
   */
  openUrl(filePath: string) {
    const relative = this.relative(filePath);
    return `/api/agent-runs/workspace-preview/${relative.split("/").map(encodeURIComponent).join("/")}`;
  }

  private relative(value: string) {
    const normalized = String(value ?? ".").replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/$/, "");
    if (normalized === "." || !normalized) return "";
    if (normalized.split("/").some((part) => !part || part === "." || part === "..")) throw new ForbiddenException("工作区路径无效");
    return normalized;
  }

  private resolve(actor: Actor, relative: string) {
    const root = this.root(actor);
    const candidate = path.resolve(root, ...relative.split("/"));
    if (candidate !== root && !candidate.startsWith(`${root}${path.sep}`)) throw new ForbiddenException("工作区路径越界");
    return candidate;
  }
}

function contentType(filePath: string) {
  if (/\.html?$/i.test(filePath)) return "text/html; charset=utf-8";
  if (/\.css$/i.test(filePath)) return "text/css; charset=utf-8";
  if (/\.js$/i.test(filePath)) return "text/javascript; charset=utf-8";
  if (/\.json$/i.test(filePath)) return "application/json; charset=utf-8";
  return "text/plain; charset=utf-8";
}
