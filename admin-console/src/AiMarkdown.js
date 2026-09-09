import { createElement as h } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

function safeReplyUrl(value) {
  if (value.startsWith("#")) return value;
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
    ? h("a", { href, target: href.startsWith("#") ? undefined : "_blank", rel: "noopener noreferrer" }, children)
    : h("span", null, children),
  // Model-supplied images are links, so rendering a reply makes no remote image requests.
  img: ({ src, alt }) => src
    ? h("a", { href: src, target: "_blank", rel: "noopener noreferrer" }, alt || "查看参考图片")
    : h("span", null, alt || "图片链接不可用"),
  table: ({ children }) => h("div", { className: "ai-markdown__table", tabIndex: 0, role: "region", "aria-label": "回复表格，可横向滚动" }, h("table", null, children)),
};

export function AiMarkdown({ children }) {
  return h("div", { className: "ai-markdown" }, h(Markdown, {
    remarkPlugins: [remarkGfm], components, skipHtml: true, urlTransform: safeReplyUrl,
  }, String(children ?? "")));
}
