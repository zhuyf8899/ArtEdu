import {
  Browser, ChatCircleDots, CirclesThreePlus, Code, FileDoc, FilePpt,
} from "@phosphor-icons/react";

// 创作能力定义由入口编排器与对话页共用，避免两处按钮列表出现漂移。
export const CREATION_METHODS = [
  // 默认能力是"问答"而不是某个产物类创作：
  // userId 打开页面后直接输入问题时，期望的是一段回答，而不是一张图。
  {
    id: "chat",
    label: "学习问答",
    eyebrow: "提问 / 讲解 / 思路梳理",
    placeholder: "例如：讲讲宋代山水画的构图特点，再给我三条临摹练习建议……",
    suggestions: ["讲讲宋代山水画的构图特点，再给我三条临摹练习建议。", "帮我梳理一条从临摹到独立创作的练习路径。", "把一次 45 分钟的纹样课拆成可执行的教学步骤。"],
    jobType: "chat",
    Icon: ChatCircleDots,
  },
  {
    id: "ui",
    label: "UI 创作",
    eyebrow: "界面 / 图标 / 设计系统",
    placeholder: "例如：为艺术教育平台设计一套高对比度课程卡片，并说明信息层级……",
    suggestions: ["我想做一个课程卡片界面，先帮我拆解信息层级。", "生成一张艺术教育平台首页视觉草图。", "点评这个 UI 想法：导航、课程、作品社区放在同一屏是否合理？"],
    jobType: "image",
    Icon: Browser,
  },
  {
    id: "pattern",
    label: "图案生成",
    eyebrow: "纹样 / 材质 / 视觉实验",
    placeholder: "例如：将宋代花窗与海浪结构组合成可连续平铺的蓝绿色纹样……",
    suggestions: ["讲讲传统纹样里连续纹样和单独纹样的区别。", "生成一张蓝绿色连续平铺纹样，灵感来自宋代花窗与海浪结构。", "帮我把图案创作流程拆成参考收集、提炼、重组、验证四步。"],
    jobType: "pattern",
    Icon: CirclesThreePlus,
  },
  {
    id: "vibe",
    label: "Vibe Coding",
    eyebrow: "网页 / 交互 / 可运行原型",
    placeholder: "例如：创建一个展示学生 AI 艺术作品的响应式画廊，支持分类筛选……",
    suggestions: ["帮我规划一个学生作品画廊页面的信息架构。", "生成一个展示学生 AI 艺术作品的响应式网页原型。", "先问我 5 个问题，明确这个网页原型需要哪些交互。"],
    jobType: "webpage",
    Icon: Code,
  },
  {
    id: "word",
    label: "Word 文档",
    eyebrow: "教案 / 课程方案 / 创作说明",
    placeholder: "例如：为“传统纹样与当代视觉”生成一份 45 分钟课程教案，包含目标、流程、材料和评价方式……",
    suggestions: ["帮我列一份传统纹样课程教案的大纲。", "生成一份 Word 教案：传统纹样与当代视觉，45 分钟。", "先帮我检查这份课程方案还缺哪些环节。"],
    jobType: "document",
    outputFormat: "docx",
    Icon: FileDoc,
  },
  {
    id: "slides",
    label: "PPT 演示",
    eyebrow: "汇报 / 课程课件 / 作品阐释",
    placeholder: "例如：生成一份关于 AI 辅助纹样创作的 8 页课堂汇报，包含主题、案例、方法与讨论题……",
    suggestions: ["帮我规划一份 AI 辅助纹样创作汇报的页结构。", "生成一份 8 页 PPT：AI 辅助纹样创作课堂汇报。", "把我的作品阐释改成适合课堂展示的 PPT 逻辑。"],
    jobType: "document",
    outputFormat: "pptx",
    Icon: FilePpt,
  },
  { id: "pdf", label: "PDF 文档", eyebrow: "讲义 / 阅读材料 / 打印文档", placeholder: "生成一份传统纹样入门讲义，包含学习目标和课堂练习……", suggestions: ["帮我整理传统纹样入门讲义的大纲。", "生成一份 PDF 讲义：传统纹样入门，包含学习目标和课堂练习。", "把这段课程内容改成适合打印阅读的讲义结构。"], jobType: "document", outputFormat: "pdf", Icon: FileDoc },
];

export const DEFAULT_METHOD_ID = "chat";

// 仅在服务端未配置任何可执行模型时使用的占位项。
// 不再罗列并不存在的第三方模型（gpt-4o / claude-4 / flux-1 / qwen-image）——
// 那些名字会让界面看起来"有很多模型可用"，实际一个都调不通。
// 真实模型来自 API：model_configs 中 status=active 且 id 出现在 MODEL_PROVIDERS_JSON 里的记录。
export const FALLBACK_MODELS = [
  { id: "local-demo", name: "本地演示模型", note: "未配置模型服务 · 不调用外部模型" },
];

export function creationMethod(methodId) {
  return CREATION_METHODS.find((item) => item.id === methodId) ?? CREATION_METHODS[0];
}

export function creationMethodLabel(methodId) {
  return creationMethod(methodId).label;
}

// 侧栏标题取首条输入的首行，过长时截断，避免历史列表被整段提示词撑开。
export function titleFromPrompt(prompt) {
  const firstLine = String(prompt ?? "").replace(/\s+/g, " ").trim();
  if (!firstLine) return "新创作对话";
  return firstLine.length > 22 ? `${firstLine.slice(0, 22)}…` : firstLine;
}

// 模式只影响建议语气；真正执行什么能力，由用户本轮话语里的显式意图决定。
export function resolveCreationOperation(prompt, advisoryMethodId = DEFAULT_METHOD_ID) {
  const text = String(prompt ?? "").trim().toLowerCase();
  const wantsDocument = /(生成|输出|制作|创建|导出|写一份|整理成).*(word|docx|ppt|pptx|pdf|文档|教案|课件|讲义|方案)|\b(word|docx|ppt|pptx|pdf)\b/.test(text);
  if (wantsDocument) {
    if (/\b(ppt|pptx)\b|课件|演示/.test(text)) return creationMethod("slides");
    if (/\bpdf\b|打印|讲义/.test(text)) return creationMethod("pdf");
    return creationMethod("word");
  }
  if (/(生成|出|画|绘制|创建|制作|设计).*(网页|页面|网站|html|前端|交互原型|响应式|组件)|vibe coding/.test(text)) return creationMethod("vibe");
  if (/(生成|出|画|绘制|创建|制作|设计).*(纹样|图案|花纹|平铺|pattern|材质)/.test(text)) return creationMethod("pattern");
  if (/(生成|出|画|绘制|创建|制作|设计).*(图片|图像|插画|海报|图标|icon|视觉草图|界面|ui)|出图|画一张|来一张/.test(text)) return creationMethod("ui");
  return creationMethod("chat");
}

// 组装一次生成请求：实际操作、模型、搜索开关决定 jobType 与模型参数。
export function buildCreationParameters({ methodId, advisoryMethodId, modelId, searchEnabled, reference, pageCount }) {
  const method = creationMethod(methodId);
  const advisoryMethod = creationMethod(advisoryMethodId);
  return {
    method: method.id,
    methodLabel: method.label,
    advisoryMode: advisoryMethod.id,
    advisoryModeLabel: advisoryMethod.label,
    model: modelId,
    searchEnabled,
    ...(method.outputFormat ? { outputFormat: method.outputFormat } : {}),
    ...(method.outputFormat === "pptx" && normalizePageCount(pageCount) ? { pageCount: Number(pageCount) } : {}),
    ...(reference ? { referenceFileId: reference.id, referenceFileName: reference.fileName } : {}),
  };
}

export function normalizePageCount(value) { return /^(?:[2-9]|1[0-2])$/.test(String(value)) ? String(value) : ""; }

export function formatConversationTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const diffMinutes = Math.round((Date.now() - date.getTime()) / 60000);
  if (diffMinutes < 1) return "刚刚";
  if (diffMinutes < 60) return `${diffMinutes} 分钟前`;
  if (diffMinutes < 60 * 24) return `${Math.round(diffMinutes / 60)} 小时前`;
  return new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric" }).format(date);
}
