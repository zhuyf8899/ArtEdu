/** HTML uses an opaque origin. Only this preview's temporary resource URL is loaded. */
export function workspacePreviewCsp(hostHeader: string | string[] | undefined, grantPrefix = "", trustedOrigins: string[] = []) {
  const host = normalizeHost(hostHeader);
  const prefix = /^\/api\/agent-runs\/workspace-preview-grant\/[A-Za-z0-9_-]{43}\/$/.test(grantPrefix) ? grantPrefix : "";
  const origins = [host ? `http://${host}:*` : "", host ? `https://${host}:*` : "", ...trustedOrigins];
  const assetSources = prefix ? [...new Set(origins.filter(Boolean))].map(origin => origin + prefix).join(" ") : "";
  return [
    "sandbox allow-scripts",
    "default-src 'none'",
    joinSources("style-src", assetSources, "'unsafe-inline'"),
    joinSources("script-src", assetSources, "'unsafe-inline'"),
    joinSources("img-src", assetSources, "data:", "blob:"),
    joinSources("font-src", assetSources, "data:"),
    joinSources("media-src", assetSources, "blob:"),
    "connect-src 'none'",
    "form-action 'none'",
    "base-uri 'none'",
    "frame-src 'none'",
    "frame-ancestors 'self'",
    "object-src 'none'",
  ].join("; ");
}

/**
 * SVG 预览的安全策略。
 *
 * Agent 画的图同样是不可信内容：SVG 是能内嵌 <script>、<foreignObject> 的活动格式，
 * 直接用浏览器打开就是同源可执行页面，所以必须限制。
 *
 * 这里刻意**不用** sandbox，而是直接 script-src 'none'：sandbox 只在文档型浏览上下文里
 * 有意义，而同一份 SVG 还会被生成页用 <img src="x.svg"> 引用；对图片加载路径来说，
 * 少一个语义可能不一致的指令，少一份"图片渲染不出来"的风险。绘图本来也不需要脚本。
 * 允许同主机任意路径和端口的样式、图片、字体及媒体，部分资源类型允许 data:/blob:；
 * connect-src 禁止 fetch/WebSocket 等连接，并不禁止这些获准资源的网络加载。
 */
export function svgPreviewCsp(hostHeader: string | string[] | undefined) {
  const assetSources = assetSourcesFor(normalizeHost(hostHeader));
  return [
    "default-src 'none'",
    joinSources("style-src", assetSources, "'unsafe-inline'"),
    "script-src 'none'",
    joinSources("img-src", assetSources, "data:", "blob:"),
    joinSources("font-src", assetSources, "data:"),
    joinSources("media-src", assetSources, "blob:"),
    "connect-src 'none'",
    "form-action 'none'",
    "base-uri 'none'",
    "frame-src 'none'",
    "object-src 'none'",
  ].join("; ");
}

/**
 * 按 Content-Type 选预览策略：只有能执行脚本的文档型格式才需要额外限制。
 * 其余文件（图片、字体、媒体、纯文本）交给主程序的默认策略即可。
 */
export function previewCspFor(contentType: string, hostHeader: string | string[] | undefined, grantPrefix = "", trustedOrigins: string[] = []) {
  const type = contentType.split(";")[0].trim().toLowerCase();
  if (type === "image/svg+xml") return svgPreviewCsp(hostHeader);
  if (type === "text/html" || type === "application/xhtml+xml") return workspacePreviewCsp(hostHeader, grantPrefix, trustedOrigins);
  return "";
}

// 允许任何端口：开发环境是 :4000/:4173，staging 走 nginx 的 :8080，
// 而反代只透传主机名，不带端口，所以必须用通配端口。
function assetSourcesFor(host: string) {
  return host ? `http://${host}:* https://${host}:*` : "";
}

function joinSources(...parts: string[]) {
  return parts.filter((part) => part.length > 0).join(" ");
}

/**
 * Host 头由请求方提供，只取主机名部分，并且必须长得像主机名。
 * 拿不到合法主机名时不返回该来源，仍保留策略显式允许的内联样式/脚本及 data:/blob: 资源，
 * 既不报错也不把不可信字符串原样拼进响应头。
 */
function normalizeHost(hostHeader: string | string[] | undefined) {
  const raw = Array.isArray(hostHeader) ? hostHeader[0] ?? "" : String(hostHeader ?? "");
  const first = raw.split(",")[0].trim();
  const hostname = first.replace(/:\d+$/, "");
  return /^[A-Za-z0-9.-]{1,253}$/.test(hostname) ? hostname : "";
}
