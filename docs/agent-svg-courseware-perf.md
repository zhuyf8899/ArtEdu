# Agent 建议提问、SVG 绘制、课件显示与前端性能（2026-09-27）

本轮处理四件互相独立、但都落在"Agent 产出怎么给学生看"这条链路上的事：
建议提问功能是否真的接上了、PDF 课件不该塞在页面里的小窗口、Agent 需要能画 SVG、
以及 Agent 输出时前端发卡。四项都已实现并逐条自检，下面是结论与证据。

## 1. Agent 建议提问：已接入，并修掉一处静默失效

接线本身是通的，链路为：

`CreationWorkspace.generate()` → `Portal.suggestFollowups()` → `POST /agent-runs`（`scenario: "chat"`，`parameters.source = "followup-suggestions"`）→ `POST /agent-runs/:id/execute` → 模型只输出 JSON 字符串数组 → `parseFollowupQuestions()` → 挂到本轮回复下方。

解析与兜底都在 [`admin-console/src/followupQuestions.js`](../admin-console/src/followupQuestions.js)：
模型返回里取第一个 JSON 数组、去重、限制 4–100 字、最多 3 条；模型跑题时用三条通用兜底提问补齐，
所以这一块不会空着。建议点击后只把问题带回输入框，不替用户发送。

**修掉的 bug**：旧实现用"消息条数是否相等"判断"这条回复还在不在"。长对话会被
`conversationStore` 自动压缩（只保留最近 16 条），压缩后数组长度一变，判断就落空，
建议提问被静默丢弃——界面上只是少一块内容，不报任何错。现在改为按
「助手回复 + 正文一致」从后往前定位（`findReplyIndex`），压缩过、用户已经发了新消息都不影响。

实测（headless Chrome + 桩 API）：正常对话 3 条建议正常出现；50 条消息的长对话在落库时被压缩到
16 条，建议仍然写进了压缩后的最后一条回复（`{"stored":16,"lastRole":"assistant","suggestions":3}`）。

## 2. 课件显示：PDF 交给浏览器，视频可放大观看

- **PDF 课件**：不再用 `<iframe>` 嵌在课程详情里。改为「在浏览器中打开 PDF」按钮（新标签页），
  用浏览器自带阅读器整页阅读，缩放、翻页、检索、打印都是原生的；下载仍作为备选入口保留。
- **视频课件**：页内播放器保持不变，新增「放大观看」浮层（Esc 或点空白退出），
  浮层里的播放器更宽，原生控件的全屏按钮不受影响。
- **网页课件 / Office 课件**：策略不动——单文件网页仍在页内预览，PPT/Word 仍然下载后用本机软件打开。

顺带修掉两个真问题：

1. 浮层最初用 `position: fixed` 直接渲染在页面里，但 `.route-transition` 的入场动画会留下
   `transform`，`transform` 会成为 `fixed` 的包含块，浮层实际是按整页高度居中的，会跑到视口外。
   现在与仓库里其他弹层一致，用 `createPortal` 挂到 `document.body`。
2. `LearningLibrary` 里「`?course=<id>` 自动展开课程」的 `useEffect` 被误放进 `SourcePreview`，
   那里没有 `initialCourseId` / `openCourse`，一渲染 `.css/.js` 源码类课件就抛 `ReferenceError`，
   整页白屏。已移回资源库组件。

## 3. Agent 画 SVG：能写、能开、能显示、不能执行脚本

Agent 的工作区一直允许写 `.svg` 文件，但服务端只认识 html/css/js/json，其余扩展名一律
`text/plain; charset=utf-8` + `nosniff`，浏览器不会把它当图片——生成页里 `<img src="图.svg">`
是白板。本轮补齐：

- `agent-workspace.service.ts` 的 `workspaceContentType()` 覆盖 SVG、常见位图、字体、音视频、PDF、
  Markdown/CSV/XML 等；未知扩展名仍退化为纯文本，不猜类型。
- 预览路由按真实 Content-Type 选策略（`previewCspFor`）：HTML 保持沙箱 + `allow-scripts`；
  SVG 用 `script-src 'none'` 的独立策略——它同样是能内嵌脚本的文档型格式，不能因为"只是图片"就跳过限制；
  位图/字体/媒体不需要额外策略。
- 系统提示与工作区工具说明写明"需要图形时直接画自包含的 SVG，不引用外部资源、不写 `<script>`"；
  `check_page` 现在也把内联 SVG 里的 `<image href>`、`<use href>` 纳入引用存在性检查。

实测（headless Chrome，按真实响应头喂文件）：新行为下 `<img src="logo.svg">` 以 240×120 正常绘制，
顶层打开 SVG 也能渲染（圆形填充 `rgb(170, 255, 0)`），内嵌 `<script>` 没有执行；
对照用的旧行为（`text/plain`）`naturalWidth` 为 0，确实画不出来。

## 4. 前端性能：三个真实原因，逐条改良

### 4.1 流式输出逐帧重渲染整段对话

SSE 增量是按网络分片到达的，旧代码每个分片都 `setMessages` 一次，长回复一秒几十帧，
每一帧都会重渲染整个对话区。现在增量先进合帧缓冲
（[`admin-console/src/chatStream.js`](../admin-console/src/chatStream.js)），每帧只交付一次；
暂停/收尾时用 `flush()` / `cancelFrame()` 把缓冲区里的最后一段取出，不会丢字。

### 4.2 历史回复的 Markdown 被反复解析

对话区每条气泡都是新数组里的新对象，且 `AiMarkdown` 没有 memo，于是每个增量都会把所有历史回复
重新跑一遍 Markdown 解析——对话越长越卡。现在 `AiMarkdown` 用 `memo` 包住（props 只有字符串正文），
每条消息也是 `memo` 化的 `ChatMessage` 组件，只有正文真的变了的那一条重渲染。

### 4.3 滚动跟随与动画开销

- 自动滚动改为跟随流式正文（依赖最后一条的正文长度），且只有用户本来就在底部（离底 < 160px）时才跟随，
  不抢用户往回翻看的历史位置。
- 去掉常驻装饰上的 `backdrop-filter`：吸顶导航改成不透明底色，图片角标改为更高的不透明度纯色底，
  并给固定的装饰栏加 `contain: paint`。这些模糊层原本在每次滚动时都要重算。

### 4.4 入口包过大

生产构建原本把依赖全并进入口 chunk（533 kB，超过 Vite 的 500 kB 告警线，也正是之前 README 声称已消除的那条）。
`vite.config.mjs` 现在把 React 与 Markdown 拆成独立 chunk：

| chunk | 之前 | 现在 |
| --- | --- | --- |
| 入口 | 533.45 kB（gzip 163.30） | 180.60 kB（gzip 52.00） |
| vendor-react | 并入入口 | 193.85 kB（gzip 60.55） |
| vendor-markdown | 并入入口 | 157.26 kB（gzip 47.66） |

总量基本不变，但入口缩小、依赖可并行下载，且依赖没变时哈希不变，重新部署后浏览器可以继续用缓存。

### 实测

headless Chrome + 桩 API 推 102 个增量（正文 1186 字），对比"改良前"（逐帧 `setState`、
Markdown 每次全量重解析）与"改良后"两套生产构建：

- 正常长度对话（2 条消息）：两套实现都没有长任务，正文、建议提问都完整；
  改良后 DOM 变更 158 次（102 个增量），说明确实按帧合批。
- 极端长对话（预置 300 条消息 / 151 条助手回复，每条约 800 字）重复三轮：

| 指标 | 改良前 | 改良后 |
| --- | --- | --- |
| 最长帧间隔 | 407.6 / 391.0 / 357.6 ms | 151.2 / 97.0 / 155.7 ms |
| 掉帧数（>34ms） | 3 / 4 / 3 | 2 / 3 / 3 |
| 长任务数（>50ms，最长） | 4 / 4 / 4（79–106 ms） | 3 / 3 / 4（87–93 ms） |

最坏一次卡顿从约 0.4 秒降到 0.1–0.15 秒。剩下的长任务来自"正在生长的那条回复本身必须重新渲染"，
属于固有限制；正常长度的对话不出现长任务。

## 验证方式

```powershell
npm run check                      # API 类型检查 + 104 项 API 测试 + 前端生产构建与 50 项前端测试
cd apps/api; npx tsx --test src/modules/agent/agent-workspace-content-type.test.ts
cd admin-console; node --test tests/chat-suggestions.test.mjs tests/chat-stream.test.mjs tests/courseware-display.test.mjs
```

另外用 headless Chrome（桩 API + 生产构建产物）做了真机验收：课件显示（PDF 按钮、视频放大浮层、
源码课件不崩）、建议提问（正常与 300 条消息的长对话）、SVG 渲染与脚本拦截、
流式渲染的前后对比，均有截图与 JSON 报告留档。
