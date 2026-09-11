// crypto.randomUUID 只在安全上下文（HTTPS、localhost、127.0.0.1）可用。
// 本校部署是明文 HTTP 的 IP 地址，属于不安全上下文：那里 crypto.randomUUID 是 undefined，
// 直接调用会抛 TypeError: crypto.randomUUID is not a function。
// 而调用方（会话创建、工作流新建）都在 try/catch 里，错误会被吞掉，
// 表现成“点了按钮完全没反应”。因此统一从这里取 id。
//
// 退回方案用 crypto.getRandomValues：它在不安全上下文同样可用；
// 只有在极老的浏览器上才退到 Math.random。
export function randomId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") crypto.getRandomValues(bytes);
  else for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
  // 按 RFC 4122 设置版本位（4）与变体位，保证与 randomUUID 的输出同形。
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// 短 id，例如 workflow-1a2b3c4d。
export function shortId(prefix) {
  return `${prefix}-${randomId().slice(0, 8)}`;
}
