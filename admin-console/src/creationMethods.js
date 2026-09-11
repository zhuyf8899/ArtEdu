import {
  Browser, CirclesThreePlus, Code, FileDoc, FilePpt,
} from "@phosphor-icons/react";

// 创作能力定义由入口编排器与对话页共用，避免两处按钮列表出现漂移。
export const CREATION_METHODS = [
  {
    id: "ui",
    label: "UI 创作",
    eyebrow: "界面 / 图标 / 设计系统",
    placeholder: "例如：为艺术教育平台设计一套高对比度课程卡片，并说明信息层级……",
    jobType: "image",
    Icon: Browser,
  },
  {
    id: "pattern",
    label: "图案生成",
    eyebrow: "纹样 / 材质 / 视觉实验",
    placeholder: "例如：将宋代花窗与海浪结构组合成可连续平铺的蓝绿色纹样……",
    jobType: "pattern",
    Icon: CirclesThreePlus,
  },
  {
    id: "vibe",
    label: "Vibe Coding",
    eyebrow: "网页 / 交互 / 可运行原型",
    placeholder: "例如：创建一个展示学生 AI 艺术作品的响应式画廊，支持分类筛选……",
    jobType: "webpage",
    Icon: Code,
  },
  {
    id: "word",
    label: "Word 文档",
    eyebrow: "教案 / 课程方案 / 创作说明",
    placeholder: "例如：为“传统纹样与当代视觉”生成一份 45 分钟课程教案，包含目标、流程、材料和评价方式……",
    jobType: "document",
    outputFormat: "docx",
    Icon: FileDoc,
  },
  {
    id: "slides",
    label: "PPT 演示",
    eyebrow: "汇报 / 课程课件 / 作品阐释",
    placeholder: "例如：生成一份关于 AI 辅助纹样创作的 8 页课堂汇报，包含主题、案例、方法与讨论题……",
    jobType: "document",
    outputFormat: "pptx",
    Icon: FilePpt,
  },
];

export const DEFAULT_METHOD_ID = CREATION_METHODS[0].id;

export const FALLBACK_MODELS = [
  { id: "gpt-4o", name: "GPT-4o", note: "策划与视觉理解" },
  { id: "claude-4", name: "Claude 4", note: "长文本与代码" },
  { id: "flux-1", name: "FLUX.1", note: "图像生成" },
  { id: "qwen-image", name: "Qwen Image", note: "中文视觉创作" },
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

// 组装一次生成请求：创作方法、模型、搜索开关决定 jobType 与模型参数。
export function buildCreationParameters({ methodId, modelId, searchEnabled, reference }) {
  const method = creationMethod(methodId);
  return {
    method: method.id,
    methodLabel: method.label,
    model: modelId,
    searchEnabled,
    ...(method.outputFormat ? { outputFormat: method.outputFormat } : {}),
    ...(reference ? { referenceFileId: reference.id, referenceFileName: reference.fileName } : {}),
  };
}

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
