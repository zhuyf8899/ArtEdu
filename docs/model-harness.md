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
MODEL_PROVIDERS_JSON=[{"id":"model-deepseek-v4-flash","baseUrl":"https://api.deepseek.com","model":"deepseek-v4-flash","capabilities":["chat","image","pattern","webpage"],"apiKeyEnv":"DEEPSEEK_API_KEY","timeoutMs":60000}]
DEEPSEEK_API_KEY=由部署环境的密钥管理服务注入
```

数据库迁移 `0009_deepseek_model_provider.sql` 提供与上述 `id` 对应的可见模型配置。当前 DeepSeek 接入返回 UI、图案和网页创作的文字方案；它不会伪装成已经生成图片或可下载文件。

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
