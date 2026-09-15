import React from "react";
import { createRoot } from "react-dom/client";
import { AiCreationWorkspace } from "./CreationWorkspace.jsx";
import { FeedbackProvider } from "./FeedbackCenter.jsx";
import { createConversation, saveConversation, listConversations } from "./conversationStore.js";
import "./styles.css";

// 临时布局预览：只用于本地截图验收，验收后删除。
const ACCOUNT = { id: "preview-account", name: "预览账号" };
const CREATION = {
  enabled: true,
  models: [{ id: "model-deepseek-v4-flash", name: "DeepSeek Flash", identifier: "deepseek-flash", capabilities: ["chat", "webpage", "document"] }],
  quota: {},
};

const LONG_REPLY = `## 设计方向：高对比度课程卡片

下面这套方案把「信息层级」当作第一约束，字号与留白共同承担结构，而不是依赖描边和阴影。

### 一、层级与节奏

主标题使用 32px / 字重 700，副标题 15px / 字重 500，正文 15px / 行高 1.85。三级之间只靠字号与颜色区分，避免每层都加分割线。

- **卡片主体**：背景纯白，圆角 16px，1px 描边 rgba(18,20,27,.11)
- **强调色**：紫色 #7458e8，只用在主按钮与当前项，一屏不超过两处
- **留白**：卡片内边距 24px，卡片之间 16px，分组之间 32px

### 二、内容顺序

1. 先给结论：一句话说明这个方向解决什么问题
2. 再给依据：为什么高对比度比多色彩更适合课程卡片
3. 最后给做法：可直接落地的字号、间距、颜色取值

### 三、需要你确认的两点

第一，卡片是否需要在深色背景下也保持同样的对比度；第二，主标题是否允许两行。这两点会直接影响栅格的选择。`;

async function seed() {
  const history = [
    ["图案生成", "深蓝渐变底色配对称纹样"],
    ["文档生成", "把课程大纲整理成要点文档"],
    ["UI 创作", "登录页信息层级梳理"],
    ["UI 创作", "艺术教育平台配色方案"],
  ];
  for (const [methodId, title] of history) {
    const item = createConversation(ACCOUNT.id, methodId, title);
    await saveConversation({ ...item, messages: [
      { role: "user", content: title },
      { role: "assistant", content: `收到，围绕「${title}」先给出两个方向，你选一个我再展开。` },
    ] });
  }
  const active = createConversation(ACCOUNT.id, "ui", "高对比度课程卡片设计");
  await saveConversation({ ...active, messages: [
    { role: "user", content: "为艺术教育平台设计一套高对比度课程卡片，并说明信息层级。" },
    { role: "assistant", content: LONG_REPLY },
    { role: "assistant", content: "这里是按该方向生成的一张图案草稿：", artifact: {
      fileName: "pattern-draft.svg", mimeType: "image/svg+xml",
      downloadUrl: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='1024' height='1024'><rect width='1024' height='1024' fill='%23e6e2f7'/><circle cx='512' cy='512' r='300' fill='%237458e8' opacity='.55'/></svg>",
    } },
  ] });
  // 最后写入一个空的问答对话：它 updatedAt 最新 → 成为当前会话 → 展示空态与初始提示词。
  await saveConversation(createConversation(ACCOUNT.id, "chat", "新的创作对话"));
  return (await listConversations(ACCOUNT.id)).length;
}

// seed 完成后再挂载工作区，否则列表在写入前就取过一次、不会刷新。
function Preview() {
  const [ready, setReady] = React.useState(false);
  React.useEffect(() => { seed().then(() => setReady(true)); }, []);
  return <div style={{ padding: "22px", background: "#ececec", minHeight: "100vh" }}>
    {ready ? <AiCreationWorkspace account={ACCOUNT} creation={CREATION} onCreate={async () => ({ content: LONG_REPLY })} onNotice={() => {}} />
      : <p style={{ font: "13px monospace", color: "#555" }}>准备预览数据…</p>}
  </div>;
}

createRoot(document.getElementById("root")).render(
  <FeedbackProvider><Preview /></FeedbackProvider>,
);
