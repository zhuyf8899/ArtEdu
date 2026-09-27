import { createElement as h, memo } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function safeReplyUrl(value) {
  if (value.startsWith("#")) return value;
  // 站内路由无需知道部署域名；只接受单个绝对路径，拒绝 protocol-relative URL。
  if (/^\/(?!\/)/.test(value)) return value;
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url.href : "";
  } catch { return ""; }
}

const components = {
  h1: ({ children }) => h("h3", null, children),
  h2: ({ children }) => h("h3", null, children),
  h3: ({ children }) => h("h4", null, children),
  a: ({ href, children }) => href
    ? h("a", { href, target: href.startsWith("#") || href.startsWith("/") ? undefined : "_blank", rel: "noopener noreferrer" }, children)
    : h("span", null, children),
  // Model-supplied images are links, so rendering a reply makes no remote image requests.
  img: ({ src, alt }) => src
    ? h("a", { href: src, target: "_blank", rel: "noopener noreferrer" }, alt || "查看参考图片")
    : h("span", null, alt || "图片链接不可用"),
  table: ({ children }) => h("div", { className: "ai-markdown__table", tabIndex: 0, role: "region", "aria-label": "回复表格，可横向滚动" }, h("table", null, children)),
};

/**
 * memo 不是装饰：流式输出期间每个增量都会重渲染对话区，已完成的回复正文并没有变。
 * 不 memo 的话每次增量都会把所有历史回复重新跑一遍 Markdown 解析，长对话越写越卡。
 * props 只有 children（字符串），默认的浅比较就足够精确。
 */
export const AiMarkdown = memo(function AiMarkdown({ children }) {
  return h("div", { className: "ai-markdown" }, h(Markdown, {
    remarkPlugins: [remarkGfm], components, skipHtml: true, urlTransform: safeReplyUrl,
  }, String(children ?? "")));
});
