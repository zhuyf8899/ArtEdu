import { ForbiddenException, Injectable } from "@nestjs/common";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import puppeteer from "puppeteer-core";
import { pdfBrowserPath } from "../generation/pdf-export";
import { AgentWorkspaceService } from "./agent-workspace.service";
import type { Actor } from "../auth/auth.service";

const MAX_SHOT_BYTES = 4 * 1024 * 1024;
const RENDER_DIRECTORY = ".artedu-render";

export interface PageRenderOptions {
  width: number;
  height: number;
  fullPage: boolean;
}

export interface PageRenderDiagnostics {
  title: string;
  styleSheetCount: number;
  cssRuleCount: number | string;
  bodyBackground: string;
  bodyHeight: number;
  consoleErrors: string[];
  failedRequests: string[];
  externalRequests: string[];
}

let active = false;

@Injectable()
export class AgentPageRenderService {
  constructor(private readonly workspace: AgentWorkspaceService) {}

  /**
   * 把工作区里的一个 HTML 真正渲染一遍并截图。
   *
   * 存在意义：模型写完网页后是"看不见"结果的，只有拿到截图和诊断
   * （控制台报错、加载失败的资源、CSS 规则数）才能自己发现"页面是裸 HTML"
   * 这类问题并修复，而不是把坏页面直接交给用户。
   *
   * 保真度：渲染用的是该用户工作区的真实文件，并且**阻断一切外部网络**
   * （和线上预览页一致：预览离线，外链 CDN 一律加载失败），
   * 所以截图里看到的失败与线上一致。
   */
  async render(actor: Actor, filePath: string, options: PageRenderOptions) {
    const executablePath = pdfBrowserPath();
    if (!executablePath || !existsSync(executablePath)) throw new Error("页面渲染服务尚未配置：容器内找不到浏览器可执行文件");
    if (active) throw new Error("页面渲染服务繁忙，请稍后重试");

    const workspaceRoot = this.workspace.rootPathFor(actor);
    // 先用工作区服务校验目标文件存在且在工作区内（越界会直接抛错）。
    const opened = await this.workspace.open(actor, filePath);
    // 这里只需要类型校验，立刻释放句柄，避免留下未消费的读流。
    opened.stream.destroy();
    signedContentType(opened.contentType);

    active = true;
    const server = createStaticServer(workspaceRoot);
    let browser: Awaited<ReturnType<typeof puppeteer.launch>> | null = null;
    try {
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      const port = (server.address() as { port: number }).port;
      const target = new URL(`http://127.0.0.1:${port}/${encodePath(filePath)}`);

      browser = await puppeteer.launch({
        executablePath,
        headless: true,
        timeout: 20000,
        args: ["--disable-background-networking", "--disable-extensions", "--no-first-run", "--disable-dev-shm-usage"],
      });
      const page = await browser.newPage();
      await page.setViewport({ width: options.width, height: options.height, deviceScaleFactor: 1 });

      const consoleErrors: string[] = [];
      const failedRequests: string[] = [];
      const externalRequests: string[] = [];
      page.on("console", (message) => {
        if (message.type() === "error") consoleErrors.push(clip(`${message.text()}`));
      });
      page.on("pageerror", (error) => consoleErrors.push(clip(`未捕获异常：${error instanceof Error ? error.message : String(error)}`)));
      await page.setRequestInterception(true);
      page.on("request", (request) => {
        const url = request.url();
        // 只允许本地临时服务与 data:/blob:；其余一律阻断——预览页是离线的，
        // 外链字体/CDN 在线上同样加载不到，这里必须保持一致的口径。
        if (url.startsWith(`http://127.0.0.1:${port}/`) || url.startsWith("data:") || url.startsWith("blob:")) { void request.continue(); return; }
        if (/^https?:/i.test(url)) externalRequests.push(clip(url));
        void request.abort();
      });
      page.on("requestfailed", (request) => {
        const reason = request.failure()?.errorText ?? "请求失败";
        failedRequests.push(clip(`${reason} ${request.url().replace(`http://127.0.0.1:${port}`, "")}`));
      });

      await page.goto(target.toString(), { waitUntil: "load", timeout: 20000 });
      // 给页面脚本留一点运行时间（canvas 动画、字体、懒加载）。
      await new Promise((resolve) => setTimeout(resolve, 600));

      const measured = await page.evaluate(() => {
        const sheets = [...document.styleSheets];
        let rules: number | string = 0;
        try {
          rules = sheets.reduce((total, sheet) => total + (sheet.cssRules?.length ?? 0), 0);
        } catch (error) {
          rules = `不可读(${error instanceof Error ? error.name : "未知"})`;
        }
        return {
          title: document.title,
          styleSheetCount: sheets.length,
          cssRuleCount: rules,
          bodyBackground: getComputedStyle(document.body).backgroundColor,
          bodyHeight: document.body.scrollHeight,
        };
      });

      const shot = await page.screenshot({ type: "png", fullPage: options.fullPage, captureBeyondViewport: options.fullPage });
      const buffer = Buffer.from(shot);
      if (buffer.byteLength > MAX_SHOT_BYTES) throw new Error("截图过大，请缩小窗口尺寸或关闭 fullPage");

      const shotPath = `${RENDER_DIRECTORY}/${Date.now().toString(36)}-${path.basename(filePath).replace(/[^\w.-]+/g, "_")}.png`;
      const absolute = path.join(workspaceRoot, ...shotPath.split("/"));
      await mkdir(path.dirname(absolute), { recursive: true, mode: 0o700 });
      await writeFile(absolute, buffer, { mode: 0o600 });

      return {
        status: "succeeded",
        screenshotPath: shotPath,
        openUrl: this.workspace.openUrl(shotPath),
        renderedPath: filePath,
        viewport: { width: options.width, height: options.height, fullPage: options.fullPage },
        diagnostics: {
          ...measured,
          consoleErrors,
          failedRequests,
          externalRequests: [...new Set(externalRequests)],
        } satisfies PageRenderDiagnostics,
        hint: buildHint(measured, consoleErrors, failedRequests, externalRequests),
      };
    } finally {
      active = false;
      if (browser) await browser.close().catch(() => undefined);
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }
}

/** 把诊断翻译成一句可执行的结论，模型据此决定是否需要返工。 */
function buildHint(measured: { cssRuleCount: number | string }, consoleErrors: string[], failedRequests: string[], externalRequests: string[]) {
  const issues: string[] = [];
  if (measured.cssRuleCount === 0) issues.push("页面没有任何生效的 CSS 规则（通常是样式表路径写错或样式没写进工作区）");
  if (consoleErrors.length) issues.push(`控制台有 ${consoleErrors.length} 条报错`);
  if (failedRequests.length) issues.push(`有 ${failedRequests.length} 个资源加载失败`);
  if (externalRequests.length) issues.push(`引用了 ${[...new Set(externalRequests)].length} 个外部地址，预览环境离线，它们一定加载不到`);
  return issues.length ? `自检未通过：${issues.join("；")}。请修复后重新渲染确认。` : "自检通过：样式与脚本均已正常加载，没有控制台报错或资源加载失败。";
}

function signedContentType(contentType: string) {
  if (!contentType.startsWith("text/html")) throw new ForbiddenException("只能渲染工作区里的 HTML 文件");
}

function encodePath(filePath: string) {
  return filePath.split("/").filter(Boolean).map(encodeURIComponent).join("/");
}

/**
 * 工作区只读静态服务：仅监听 127.0.0.1，且解析出的路径必须仍在工作区目录内。
 * 抽成纯函数便于单测越界与目录回退（index.html）行为。
 */
export function resolveWorkspaceRequest(root: string, requestPath: string) {
  let pathname: string;
  try {
    pathname = decodeURIComponent(requestPath.split("?")[0] ?? "/");
  } catch {
    return null;
  }
  const target = path.resolve(root, `.${pathname}`);
  const normalizedRoot = path.resolve(root);
  if (target !== normalizedRoot && !target.startsWith(`${normalizedRoot}${path.sep}`)) return null;
  return target;
}

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".htm": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif", ".ico": "image/x-icon", ".mp4": "video/mp4",
  ".webm": "video/webm", ".woff2": "font/woff2", ".woff": "font/woff", ".txt": "text/plain; charset=utf-8",
};

function createStaticServer(root: string) {
  return createServer(async (request, response) => {
    const resolved = resolveWorkspaceRequest(root, request.url ?? "/");
    if (!resolved) { response.writeHead(403).end("forbidden"); return; }
    try {
      let target = resolved;
      const info = await stat(target);
      if (info.isDirectory()) target = path.join(target, "index.html");
      const body = await readFile(target);
      response.writeHead(200, { "Content-Type": CONTENT_TYPES[path.extname(target).toLowerCase()] ?? "application/octet-stream", "Cache-Control": "no-store" });
      response.end(body);
    } catch {
      response.writeHead(404).end("not found");
    }
  });
}

function clip(value: string) {
  return value.length > 300 ? `${value.slice(0, 299)}…` : value;
}
