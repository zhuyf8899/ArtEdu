# 生图链路排查与验证

## “图片服务没有返回实际私有图片”

该错误来自 Agent 工具对返回产物的校验，并不能单独证明图片供应商故障。触发条件是生成服务返回后，没有 artifact、MIME 不属于允许的位图格式，或 downloadUrl 不是站内 `/api/` 地址。

优先核对运行进程实际加载的 `MODEL_PROVIDERS_JSON`，以及失败任务的 `model_config_id`、`status`、`error_message` 和 `generation_outputs` 记录。不要输出 API Key。

- 用户要求生图时，即使当前选中的是文本模型，也自动转交图片通道；不会因模型选择而拒绝请求。文本协议适配器会屏蔽误报的 `image` / `pattern` 能力，防止把文字方案当成生成图片。
- 图片模型需要显式设置 `siliconflow-image`、`modelscope-image` 或 `openai-image` 协议，并在同一运行环境配置对应密钥。优先使用已配置密钥的图片通道：支持生图的显式选择优先，其余按配置顺序选取。任务、供应商调用和用量都记录实际图片模型，原有额度检查照常执行。
- 数据库迁移和 GitHub 代码同步不会自动同步私有 `.env`。修改环境变量后须重启 API，不能只更新数据库中的能力列表。
- 图片和图案任务现在会在标记成功前校验产物类型、MIME、存储键和文件大小。只有文字方案、SVG 或空产物会记录为失败，使用 `image_artifact_error` 错误码。
- 任务已有图片产物时，继续检查私有下载接口和工作区副本；任务失败时，根据真实 HTTP 错误、鉴权或超时检查供应商。缩短提示词不能解决固定的返回结构错误。

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
