import { createElement as h } from "react";
import { ArrowSquareOut, BookOpenText, Palette } from "@phosphor-icons/react";

// 仅提供公开站点入口，不传递 ArtEdu 登录令牌、对话或额度信息。
export const PIYING_TOOL_URL = "https://piying.woooostudio.com/";

export function PiyingToolCard() {
  return h("section", { className: "piying-tool", "aria-labelledby": "piying-tool-title" },
    h("div", { className: "piying-tool__intro" },
      h("span", { className: "piying-tool__icon", "aria-hidden": true }, h(Palette, { size: 32, weight: "duotone" })),
      h("div", { className: "piying-tool__heading" },
        h("p", { className: "piying-tool__eyebrow" }, "创作工具 · Woooo Piying Lab"),
        h("div", { className: "piying-tool__title-row" },
          h("h2", { id: "piying-tool-title" }, "数字皮影实验室"),
          h("span", { className: "piying-tool__badge" }, "外部工具")),
        h("p", { className: "piying-tool__description" }, "探索数字皮影的生成、演绎与制作，查找皮影素材、模板及配套插件教程。"),
        h("ul", { className: "piying-tool__tags", "aria-label": "工具用途" },
          ...["数字皮影", "素材与模板", "插件教学"].map(tag => h("li", { key: tag }, tag))))),
    h("div", { className: "piying-tool__actions" },
      h("a", {
        className: "piying-tool__link", href: PIYING_TOOL_URL,
        target: "_blank", rel: "noopener noreferrer", referrerPolicy: "no-referrer",
        "aria-describedby": "piying-tool-destination",
      }, "进入皮影实验室", h(ArrowSquareOut, { size: 20, weight: "bold", "aria-hidden": true })),
      h("p", { id: "piying-tool-destination", className: "piying-tool__destination" },
        "将在新标签页打开，保留当前页面。", h("br"),
        h("span", null, "piying.woooostudio.com"))),
    // 原生 details 支持键盘与触屏，无弹窗，不因查看说明而请求外站。
    h("details", { className: "piying-tool__help" },
      h("summary", null, h(BookOpenText, { size: 20, "aria-hidden": true }), "查看使用说明"),
      h("ol", null,
        h("li", null, "进入实验室后，按需要选择生成、演绎、生产，或浏览素材与模板。"),
        h("li", null, "使用 Blender、Unity、AE、Figma 或 Godot 插件时，请先阅读目标网站的配套教程。"),
        h("li", null, "本期仅提供网站跳转，不会自动同步 ArtEdu 账号、对话、作品或额度。"),
        h("li", null, "如目标网站要求登录或收费，请以其提示为准；作品保存方式以该网站实际功能为准。")),
      h("p", null, "打不开？请检查网络，或复制上方网址到浏览器。原工作流学习与创作功能仍在下方。")));
}
