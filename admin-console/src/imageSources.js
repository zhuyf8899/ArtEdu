/**
 * 图片来源与图像产物的纯逻辑。
 *
 * 单独成模块是为了能被 node 直接测：这些规则（哪些地址允许加载、某个产物算不算图片、
 * 外链工具的页标从哪里取）一旦写错，界面上表现为"图片空白"或"图标一直是默认的"，
 * 不报错、很难查，所以必须有断言盯着。
 */

/** 图片地址白名单：站内相对路径与 https 直链；拒绝协议相对地址、data:/javascript: 与带凭据的地址。 */
export function safeImageUrl(value) {
  const url = String(value ?? "").trim();
  if (/^\/(?!\/)/.test(url)) return url;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && !parsed.username && !parsed.password ? parsed.href : "";
  } catch { return ""; }
}

/** 产物是不是图片：优先看服务端给的 mimeType，退回看扩展名。 */
export function isImageArtifact(file) {
  if (!file) return false;
  if (typeof file.mimeType === "string" && file.mimeType.startsWith("image/")) return true;
  return /\.(png|jpe?g|webp|gif|avif|bmp|svg)$/i.test(String(file.fileName ?? ""));
}

/**
 * 外链工具的页标候选（按顺序回退）：站点自己的 favicon.ico → DuckDuckGo 图标服务 → Google 图标服务。
 * 站内路径与非法地址返回空数组，调用方直接用内置图标。
 */
export function faviconSourcesFor(href) {
  let host = "";
  try {
    const url = new URL(String(href ?? ""));
    host = ["http:", "https:"].includes(url.protocol) ? url.hostname : "";
  } catch { host = ""; }
  if (!host) return [];
  return [
    `https://${host}/favicon.ico`,
    `https://icons.duckduckgo.com/ip3/${host}.ico`,
    `https://www.google.com/s2/favicons?domain=${host}&sz=64`,
  ];
}
