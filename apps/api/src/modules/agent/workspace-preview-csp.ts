/**
 * 工作区预览页的安全策略。
 *
 * 预览页是模型替用户生成的内容，必须当成不可信页面：保留 CSP sandbox，
 * 让它拿不到同源身份（读不到 cookie 与 localStorage），同时禁止联网、提交表单和顶层跳转。
 *
 * 但 sandbox 会把文档变成不透明来源（opaque origin），此时 CSP 里的 'self'
 * 不匹配任何 URL —— HTML 引用的同目录 CSS/JS/图片会被全部拦掉，
 * 页面只剩浏览器默认样式，看起来就是"生成的网页完全没有样式"。
 * 这里改为显式写出预览自身的主机名（任意端口、http/https 都允许）：
 * 资源匹配是按 URL 判定的，不受不透明来源影响，所以工作区内的文件能正常加载，
 * 而沙箱、断网这些限制一条都没有放松。
 *
 * 注意：这条策略还必须真的落到响应上。main.ts 的全局 onSend 钩子只在响应
 * 没有声明 CSP 时才补默认值，否则会把这里的策略覆盖成 default-src 'none'，
 * 页面依然会退化成没有样式的裸 HTML。
 *
 * 另外必须带 allow-same-origin（见 buildPolicy 下方说明）：只声明 allow-scripts
 * 时文档是不透明来源，"加载同目录样式表/脚本"会被当成跨站请求——SameSite=Lax 的
 * 会话 cookie 不发送 → 接口返回 401 JSON → Chrome 的 ORB 以
 * net::ERR_BLOCKED_BY_ORB 拦掉，页面永远是裸 HTML、脚本也不执行。
 * 这是实测结论（绕过 CSP 渲染同一页面时样式与脚本都正常）。
 *
 * 代价：生成页与平台同源，能读到本站 localStorage / IndexedDB。仍保留的限制是
 * 不能联网（connect-src 'none'）、不能提交表单、不能内嵌框架与插件、不能下载、不能开弹窗。
 * 后续更干净的方案是给预览资源发签名令牌（不依赖 cookie），再恢复不透明来源。
 */
export function workspacePreviewCsp(hostHeader: string | string[] | undefined) {
  const host = normalizeHost(hostHeader);
  // 允许任何端口：开发环境是 :4000/:4173，staging 走 nginx 的 :8080，
  // 而反代只透传主机名，不带端口，所以必须用通配端口。
  const assetSources = host ? `http://${host}:* https://${host}:*` : "";
  const sources = (...parts: string[]) => parts.filter((part) => part.length > 0).join(" ");
  return [
    // 必须带 allow-same-origin，见下方说明：只写 allow-scripts 会让同目录 CSS/JS 全被 ORB 拦掉。
    "sandbox allow-scripts allow-same-origin",
    "default-src 'none'",
    sources("style-src", assetSources, "'unsafe-inline'"),
    sources("script-src", assetSources, "'unsafe-inline'"),
    sources("img-src", assetSources, "data:", "blob:"),
    sources("font-src", assetSources, "data:"),
    sources("media-src", assetSources, "blob:"),
    "connect-src 'none'",
    "form-action 'none'",
    "base-uri 'none'",
    "frame-src 'none'",
    "object-src 'none'",
  ].join("; ");
}

/**
 * Host 头由请求方提供，只取主机名部分，并且必须长得像主机名。
 * 拿不到合法主机名时不返回该来源，页面退回"只有内联样式/脚本可用"，
 * 既不报错也不把不可信字符串原样拼进响应头。
 */
function normalizeHost(hostHeader: string | string[] | undefined) {
  const raw = Array.isArray(hostHeader) ? hostHeader[0] ?? "" : String(hostHeader ?? "");
  const first = raw.split(",")[0].trim();
  const hostname = first.replace(/:\d+$/, "");
  return /^[A-Za-z0-9.-]{1,253}$/.test(hostname) ? hostname : "";
}
