# 生图链路排查与验证

## “图片服务没有返回实际私有图片”

该错误来自 Agent 工具对返回产物的校验，并不能单独证明图片供应商故障。触发条件是生成服务返回后，没有 artifact、MIME 不属于允许的位图格式，或 downloadUrl 不是站内 `/api/` 地址。

优先核对运行进程实际加载的 `MODEL_PROVIDERS_JSON`，以及失败任务的 `model_config_id`、`status`、`error_message` 和 `generation_outputs` 记录。不要输出 API Key。

- 用户要求生图时，即使当前选中的是文本模型，也自动转交图片通道；不会因模型选择而拒绝请求。文本协议适配器会屏蔽误报的 `image` / `pattern` 能力，防止把文字方案当成生成图片。
- 图片模型需要显式设置 `siliconflow-image`、`modelscope-image` 或 `openai-image` 协议，并在同一运行环境配置对应密钥。优先使用已配置密钥的图片通道：支持生图的显式选择优先，其余按配置顺序选取。任务、供应商调用和用量都记录实际图片模型，原有额度检查照常执行。
- 数据库迁移和 GitHub 代码同步不会自动同步私有 `.env`。修改环境变量后须重启 API，不能只更新数据库中的能力列表。
- 图片和图案任务现在会在标记成功前校验产物类型、MIME、存储键和文件大小。只有文字方案、SVG 或空产物会记录为失败，使用 `image_artifact_error` 错误码。
- 任务已有图片产物时，继续检查私有下载接口和工作区副本；任务失败时，根据真实 HTTP 错误、鉴权或超时检查供应商。缩短提示词不能解决固定的返回结构错误。

## 通道未接入或缺密钥

数据库中的图片模型目录记录并不等于运行进程已接通图片服务。私有 `.env` 的
`MODEL_PROVIDERS_JSON` 必须保留文本模型，并加入实际图片通道。例如 SiliconFlow
Kolors 使用 `protocol: "siliconflow-image"`、`model: "Kwai-Kolors/Kolors"`、
`baseUrl: "https://api.siliconflow.cn/v1"`，仅通过 `apiKeyEnv: "SILICONFLOW_API_KEY"`
引用服务端密钥。接口与参数见 [SiliconFlow 官方图片 API](https://api-docs.siliconflow.cn/docs/api/images-generations-post)。

不要在文本通道上添加 `image` 标签冒充生图能力。图片路由会自动选择实际图片
通道；缺通道返回 `IMAGE_PROVIDER_NOT_CONFIGURED`，缺密钥返回
`IMAGE_PROVIDER_KEY_MISSING`，均为 `retryable: false`。这两类错误在创建生成任务和
检查额度之前终止，不请求供应商，不因调整提示词而重复提交。

对话收到这两类配置错误后，只调用一次生图工具并结束为失败或部分完成；此前
已经保存的网页等成果保留，失败原因与工具结果落库。不会把配置故障显示成用户
暂停，也不会以 SVG、网页或文字方案冒充图片。普通供应商网络故障不被误判为
缺配置，仍按下面的分阶段重试规则处理。

密钥只写本地 `apps/api/.env` 的 `SILICONFLOW_API_KEY=...`，不要发到聊天、前端
环境变量或 Git。保存后重启 API，再执行本文的完整链路检查；仅完成代码测试
不能声称真实供应商已接通或已经成功出图。

## 短暂故障自动恢复

图片提交、任务轮询和文件下载均有独立的阶段标记和等待上限，用户取消信号不会覆盖服务端超时。重试最多三次，使用退避与随机间隔，并尊重供应商的 `Retry-After`。

- 图片下载、异步任务查询出现短暂网络错误或 408/429/500/502/503/504 时自动恢复；下载流中途断开或返回空文件也重试下载，避免重新生图。
- 提交生图仅在明确的建连失败或 HTTP 429 时重试。连接在发送后断开、响应超时、上游 5xx 都不能保证任务未执行，因此不会自动重新提交或切换供应商，避免重复生成和扣费。
- 图片密钥返回 401/402/403 且已配置备用密钥时，自动使用备用密钥。下载或网络故障不触发换密钥。
- 失败用量记录使用 `image_submit_*`、`image_poll_*`、`image_download_*` 错误码。服务器日志包含任务 ID、实际模型、失败阶段、尝试次数、上游状态和原因码；不记录密钥、提示词或带签名的图片地址。

这些措施用于减少可恢复故障直接暴露给用户；不保证供应商持续不可用时也能出图，也不将无法确认执行状态的提交当作可安全重试。

## 本地完整链路检查

启动已配置模型和数据库的本地 API 或开发前端后，在仓库根目录运行：

```powershell
$env:ARTEDU_LIVE_IMAGE_TEST='true'
$env:ARTEDU_TEST_ORIGIN='http://localhost:4173'
npm run test:images:live
```

该命令仅接受本机地址，默认使用本地演示学生和运营账号。若密码已调整，通过以下环境变量传入测试账号；不要把密码写进文档或提交到 Git：

```text
ARTEDU_TEST_STUDENT_USERNAME
ARTEDU_TEST_STUDENT_PASSWORD
ARTEDU_TEST_OPERATOR_USERNAME
ARTEDU_TEST_OPERATOR_PASSWORD
```

直接连接 API（例如 `http://127.0.0.1:4000`）时，设置 `ARTEDU_TEST_ORIGIN` 为该 API 地址；如果 API 的 CORS 白名单使用前端来源，再将 `ARTEDU_TEST_REQUEST_ORIGIN` 设置为白名单中的来源。

检查内容包括：

1. 拒绝未登录生图；已登录用户即使选择文本模型也能自动使用图片通道。
2. 直接生图返回真实文件，任务成功状态持久化，文件大小和 PNG 文件头正确。
3. 下载需要登录，其他普通角色不能读取学生的生成文件，响应禁止缓存。
4. Agent 调用一次 `generate_image`，图片副本写入工作区，可经认证接口读取且字节一致。
5. Agent 执行记录和工具结果持久化。文件尚未经过视觉验收时允许 `partial` 状态，不将其误判为没有出图。

此检查会产生真实图片和文本模型用量，并在本地数据库中保留任务。结果和图片写入被 Git 忽略的 `apps/api/data/image-qa/`。

2026-10-19 的沙箱验证中，现有 Kolors API 曾在约 5 秒内返回有效 PNG；模拟供应商配合真实本地 API、数据库和工作区也完成了上述链路检查。这些结果不能代替对其他云端运行环境的配置核对。

2026-10-19 本机补入私有 SiliconFlow 密钥并重启 API 后，使用真实 Kolors 服务完成
直接生图与 Agent 对话生图检查，分别得到 2,147,478 与 2,170,767 字节的 PNG。
对话仅调用一次 `generate_image`，私有工作区副本与生成产物字节一致；匿名下载
返回 401，其他普通账号读取返回 403。对应检查报告保存在被 Git 忽略的
`apps/api/data/image-qa/report.json`，测试图片和密钥不提交到仓库。

该 Agent 验收记录为 `partial`，原因是自动视觉核验仍待完成，而非图片生成失败；
实际生图任务、图片下载与工作区保存已成功。不能为消除提示而伪造视觉验收状态。
