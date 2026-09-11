# 模型接入与 Harness

模型供应商通过 `apps/api/.env` 的 `MODEL_PROVIDERS_JSON` 配置，不把 API key 写入仓库。每个配置包含 `id`、`baseUrl`、`model`、`capabilities` 和可选的 `apiKeyEnv`。

示例：

```env
MODEL_EXECUTION_ENABLED=true
MODEL_PROVIDERS_JSON=[{"id":"school-chat","baseUrl":"https://model.example.edu/v1","model":"school-chat-v1","capabilities":["chat"],"apiKeyEnv":"SCHOOL_CHAT_API_KEY"}]
SCHOOL_CHAT_API_KEY=由本机密钥管理注入
```

当前适配器使用 OpenAI-compatible `chat/completions` 协议作为第一版基线，能力类型已经覆盖 `chat`、`image`、`video`、`webpage`、`pattern`、`document` 和 `knowledge_graph`。图像、视频等供应商的专用响应解析和对象存储写入仍应在对应适配器中实现，不应塞进 Worker 业务逻辑。

## DeepSeek 首页对话

首页创作框通过服务端 `POST /api/generation-jobs/run` 同步调用已配置的文本模型。API Key 仅从 API 进程环境变量读取，浏览器响应、数据库任务参数和 Git 仓库均不包含密钥。调用前仍使用管理员配置的每日、每月和并发额度；调用后会记录任务状态和供应商返回的 token 用量。

```env
MODEL_EXECUTION_ENABLED=true
MODEL_PROVIDERS_JSON=[{"id":"model-deepseek-v4-pro","baseUrl":"https://api.deepseek.com","model":"deepseek-v4-pro","capabilities":["chat","image","pattern","webpage","document"],"apiKeyEnv":"DEEPSEEK_API_KEY","timeoutMs":60000}]
DEEPSEEK_API_KEY=由部署环境的密钥管理服务注入
```

数据库迁移 `0009_deepseek_model_provider.sql` 建立 DeepSeek 供应商记录，`0014_deepseek_v4_pro_model.sql` 把默认可执行模型切到 V4 Pro 并让旧的 V4 Flash 记录退出可执行列表。**`MODEL_PROVIDERS_JSON` 里的 `id` 必须与 `model_configs.id` 完全一致**，前端下拉只展示两者都命中的模型；只改其中一边会导致首页没有任何可用模型。可用模型 ID 以供应商 `/models` 接口为准（本账号为 `deepseek-v4-pro` 与 `deepseek-flash`，其中 `deepseek-v4-flash` 是后者的别名）。

当前 DeepSeek 接入返回 UI、图案和网页创作的文字方案；它不会伪装成已经生成图片。选择“Word 文档”或“PPT 演示”时，服务端会将模型生成的结构化内容导出为可下载的 `.docx` 或 `.pptx` 文件；旧版 `.doc` / `.ppt` 不在首期支持范围内。

### ModelScope 文生图（图像 / 图案）

ModelScope（魔搭）文生图不兼容 OpenAI 的 `chat/completions`，因此单独实现适配器，并在 `MODEL_PROVIDERS_JSON` 里用 `protocol` 显式声明：

```env
MODEL_PROVIDERS_JSON=[{"id":"model-deepseek-v4-pro","baseUrl":"https://api.deepseek.com","model":"deepseek-v4-pro","capabilities":["chat","webpage","document"],"apiKeyEnv":"DEEPSEEK_API_KEY","timeoutMs":60000},{"id":"model-modelscope-qwen-image","baseUrl":"https://api-inference.modelscope.cn","model":"Qwen/Qwen-Image","capabilities":["image","pattern"],"apiKeyEnv":"MODELSCOPE_API","timeoutMs":120000,"protocol":"modelscope-image"}]
MODELSCOPE_API=由部署环境的密钥管理服务注入
```

调用链：`POST /v1/images/generations`（带 `X-ModelScope-Async-Mode: true`）拿 `task_id` → 轮询 `GET /v1/tasks/{task_id}`（带 `X-ModelScope-Task-Type: image_generation`）→ 下载 `output_images[0]` 写入 `UPLOAD_ROOT/generated/<jobId>/`。适配器返回 `kind: "asset"`，服务层登记 `generation_outputs`，前端通过 `/api/generation-jobs/:jobId/download` 内联展示（该响应为 `Content-Disposition: inline`，文档仍为 `attachment`）。

两个必须同时满足的条件，缺一个首页就没有可用模型：

1. 数据库 `model_configs` 存在同 id 且 `status='active'` 的记录（`0015_modelscope_image_model.sql`）；
2. `MODEL_PROVIDERS_JSON` 里存在同 id 的条目。

### 内部通道：图像模型不出现在前台

`MODEL_PROVIDERS_JSON` 里的条目加 `"internal": true` 后，该模型只服务后端按能力路由，**不进入前台的模型选择列表**：首页与创作页的下拉里看不到它，用户也不需要选它。

这是图像生成的正确接法——它是平台替用户调用的"生图工具"，不是让用户挑的模型：

```json
{"id":"model-modelscope-qwen-image","baseUrl":"https://api-inference.modelscope.cn","model":"Qwen/Qwen-Image",
 "capabilities":["image","pattern"],"apiKeyEnv":"MODELSCOPE_API","timeoutMs":120000,
 "protocol":"modelscope-image","internal":true}
```

配套约定：

- 前台只在**当前模型声明支持该能力**时才把 `modelConfigId` 发给服务端；图像/图案这类内部通道任务不带 `modelConfigId`，由 `ModelRegistry.getForJob` 按能力路由过去。把不支持的模型 id 发过去只会被服务端拒绝（"所选模型当前未配置或不支持此创作方式"）。
- 创建对话时若模型不支持该能力，界面文案显示"平台内置图像通道"而不是某个文本模型名，避免让人以为图是那个文本模型画的。
- 过滤发生在 `portal.service.ts`：只暴露 `status='active'`、命中 `MODEL_PROVIDERS_JSON`、且 `internal !== true` 的模型。

**能力声明要诚实**：`ModelRegistry.getForJob` 取「第一个声明支持该任务类型的适配器」。文本模型若也声明 `image`/`pattern`（并且排在前面），图片任务会被路由到它，只返回文字方案、永远出不了图。`0015` 因此把 DeepSeek 的能力收窄为 `chat/webpage/document`，图像与图案只由 ModelScope 声明。

### 合并后保留配置与部署

- GitHub 保存接口代码、数据库迁移和配置模板，不保存 API Key。GitHub 仓库不是 API 运行服务器；只拉取代码或打开静态预览不能代替后端部署。
- 本机继续使用已配置的 `apps/api/.env`。它被 Git 忽略，也被 Docker 构建上下文排除；更新代码时不要覆盖此文件。
- Docker 测试服务器使用根目录的私有 `.env`（参考 `deploy/staging.env.example`）。填写 `DEEPSEEK_API_KEY`，设置 `MODEL_EXECUTION_ENABLED=true` 并保留对应的 `MODEL_PROVIDERS_JSON`。Compose 会在运行时传给 API 容器；不会传给前端。不要把 Key 放入 `VITE_*` 或源码。
- 更新已有测试环境时，先备份数据库，然后依次执行以下命令（不要删除数据卷）：

```sh
git pull --ff-only origin main
docker compose -f docker-compose.staging.yml build api web
docker compose -f docker-compose.staging.yml up -d postgres
docker compose -f docker-compose.staging.yml run --rm api npm run db:migrate
docker compose -f docker-compose.staging.yml up -d api web
```

已有测试账号无需重新生成。首次安装需按项目初始化流程完成 seed 与账号创建；四个固定 demo 账号仅适合受控测试环境，不可用作公网正式账号。不要将测试账号生成脚本作为每次启动步骤（它会重置密码、角色并注销会话）。

首页通过服务端会话识别学生、教师、运营和管理员，登录用户不需要填写 Key，仍受管理员额度限制。当前首页为单次问答，不宣称具备完整多轮会话历史。正文使用 16px 字号，安全解析 Markdown 标题、加粗、列表、表格和代码块；禁用模型输出的原始 HTML，外部图片只显示链接。

### 回归验证（2026-09-09）

本机 `http://localhost:4173` 验证四个账号 `student.demo`、`teacher.demo`、`operator.demo`、`admin.demo` 登录后均能看到模型、获取真实文字回复并持久化成功任务；匿名首页数据与生成请求返回 401。真实测试显式开启，每次消耗四次模型请求及平台额度，并在结束后注销测试脚本自己的会话：

```powershell
$env:ARTEDU_LIVE_CHAT_TEST='true'
npm run test:chat:live
```

测试默认只接受回环地址，避免把固定测试密码发送到未知服务器；不输出密钥、会话 Cookie 或用户回复。自动化 `npm run check` 包含 24 项 API 测试和 8 项前端测试，不调用外部付费模型。真实调用验证结果只代表本机当前配置；远端部署仍需注入 Key 并独立验收。GitHub Actions 不需要 DeepSeek Key。

## 统一调用参数

Agent 和生成任务共享 `ModelRequest`。除 `messages`（支持 system/user/assistant/tool 上下文）外，统一支持 `temperature`、`topP`、`maxTokens`、`presencePenalty`、`frequencyPenalty`、`seed`、`stop`、`responseFormat`、`tools`、`toolChoice` 与 `metadata`。

`providerOptions` 用于少数供应商特有参数（例如推理档位）；它最多 30 项，且不能覆盖服务端控制的 `model`、`messages`、`stream` 等字段。第一版不接受流式输出，必须传 `stream: false` 或省略；这是为了让每次执行都能完整落入 Agent Run 审计记录。

运行无外部网络、无真实密钥依赖的接口 harness：

```powershell
cd apps/api
npm run harness:model
npm run harness:agent
```

失败占位图位于 `admin-console/public/assets/generation-failure.png`，前端在生成请求失败时展示该资源，模型失败不会被伪装成成功结果。

## 基础 Agent Harness

1. `POST /api/agent-runs` 创建 `queued` 状态的任务；输入会先做关键词扫描。
2. `POST /api/agent-runs/:runId/execute` 默认以 `{"mode":"local"}` 派发给用户本机的 Local Model Bridge。云端不再直连用户配置的模型，也不接收 API Key。`{"mode":"mock"}` 仅用于无密钥环境验证审计链路。
3. 执行器以条件更新领取任务，同一个 Run 的重复并发执行会返回冲突。local 模式写入 `local_bridge.dispatch` 后进入 `waiting_user`，由本地 Bridge 完成模型调用并回传经允许的结果。

示例：

```json
{
  "mode": "local",
  "providerId": "openai",
  "systemPrompt": "你是校内 UI 设计助教。",
  "context": [{ "role": "assistant", "content": "已确认面向本科生。" }],
  "model": { "temperature": 0.3, "maxTokens": 1200, "responseFormat": "text", "stream": false }
}
```
