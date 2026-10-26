# 轻量 API 工作流与图片遮罩

2026-10-21。平台计算节点采用服务端 API 适配，不恢复本机 GPU、Bridge 或 ComfyUI 推理进程。ComfyUI 用作画布、图片和遮罩操作的参照，不把其潜空间节点强行等价为通用图片 API。

## 本轮实现

- 新建入口使用平台 API 节点工作流；隐藏新建原生 ComfyUI 图入口，历史原生图保留查看和导出，执行按钮停用。历史原生图不自动转换，以免丢失模型、采样或插件语义。
- 节点库可插入“图片编辑与局部重绘”：图片与遮罩 → 编辑要求 → 图片编辑 API → 预览 → 保存。
- 普通运行与画布试运行共用图片遮罩输入器。支持 PNG/JPEG/WebP，解码后转为 PNG；画笔、橡皮、笔刷直径、查看缩放、滚动、撤销/重做、反选、清空、应用遮罩。
- 涂抹表示需要修改的区域；导出遮罩使用透明像素表示修改区域、不透明表示保留区域。遮罩与原图使用相同像素尺寸。未应用的遮罩会阻止提交，避免误做整图编辑。未设置遮罩时发送原图作整图编辑。
- 原图与遮罩通过既有私有临时文件接口上传，后端逐一检查账号归属、有效期、PNG 格式、尺寸和透明通道，然后才创建生成任务、调用供应商。原始文件、遮罩和密钥不嵌入工作流定义。
- 编辑请求按显式能力路由，使用 multipart `POST images/edits`，字段为 `model`、`prompt`、`image`、可选 `mask` 和 `n=1`；浏览器不持有供应商密钥。无原图的任务仍走 `images/generations`。编辑失败不会降级为纯文生图。
- 结果复用生成任务私有归档与下载、工作流产物预览。重试复用既有传输策略，不在无法确认扣费状态时盲目重发。

## 配置

在 API 私有 `MODEL_PROVIDERS_JSON` 中增加已确认支持 multipart `images/edits` 的模型配置。不得把仅支持文生图的供应商标成可编辑。例如（占位值，不能直接运行）：

```json
{
  "id": "image-edit-api",
  "baseUrl": "https://YOUR_PROVIDER/v1/",
  "model": "YOUR_EDIT_MODEL",
  "capabilities": ["image", "pattern"],
  "protocol": "openai-image",
  "imageEditing": true,
  "apiKeyEnv": "ARTEDU_IMAGE_EDIT_API_KEY",
  "timeoutMs": 180000,
  "internal": true
}
```

重启 API 后生效。不修改已有生图通道或密钥。供应商需要自行支持所选模型、图片和遮罩格式；“兼容 OpenAI 文本接口”不代表支持图片编辑。当前仅提交一张原图和一张可选遮罩，每个文件不超过 8 MiB、单边不超过 8192、最多 16,777,216 像素。供应商还可能有更严格的模型限制。

## 明确边界

本轮接通图片编辑与局部重绘，未实现专用超分、LoRA、ControlNet、分割、视频运算或任意 ComfyUI JSON 的 API 执行。后续按供应商文档添加独立能力与适配器；不把不支持的参数静默丢弃后声称执行成功。当前已有平台文字处理、文本生成和文生图节点继续使用原路径。

图片生成模型可能将遮罩作为引导而非精确像素约束，实际保留程度需通过目标模型实测。浏览器不进行本地模型推理。原图仍受现有 20 分钟临时文件保留策略约束，过期需要重新上传。

## 验证

- `npm --prefix apps/api run test:security` 包含编辑表单、显式路由、模拟供应商请求与归档、文件授权及工作流遮罩传递回归。
- `node scripts/verify-workflow-mask.mjs` 使用隔离 Chrome 实际上传 PNG、画笔涂抹、读取导出遮罩 alpha、验证尺寸、反选、撤销、清空与 390px 布局，无外部模型请求。截图位于忽略目录 `outputs/`。
- 2026-10-22 本机已追加百炼万相编辑通道；一次真实原图＋遮罩调用成功，详情见下文。SiliconFlow/ModelScope 普通生图路由保持原样。

参考：[ComfyUI 遮罩编辑](https://docs.comfy.org/interface/maskeditor)、[OpenAI 图片接口](https://developers.openai.com/api/reference/resources/images)。
# 百炼万相编辑通道

2026-10-22 已增加 `wanx-image-edit` 协议。配置示例见 API 的 `.env.example`；密钥仅从服务端 `BAILIAN_API_KEY` 读取。北京地域现有 DashScope 域名仍受官方支持，也可将 baseUrl 配为业务空间专属域名加 `/api/v1`。

平台透明 PNG 遮罩转换为纯黑白 PNG：透明编辑区为白色，保留区为黑色。有遮罩使用 `description_edit_with_mask`，无遮罩使用 `description_edit`。原图和遮罩通过 Base64 发送，不需要自建公网存储。宽高必须在 512–4096 像素之间，提示词不超过 800 字；不自动缩放或截断用户输入。

请求只生成一张，提交后查询原任务并下载成果；失败或超时不会自动重发生成任务。临时工作流传入 `transient` 时仅返回内存二进制，不落入生成文件目录。万相编辑通道不参与普通文生图路由。

`node scripts/verify-wanx-image-edit.cjs --live` 显式提交一张真实测试图，可能消耗额度。2026-10-22 已验证：约 4.7 秒返回，原图中央红色方块修改为蓝色；结果和安全摘要保存在本机 `outputs/wanx-image-edit/`。未查询余额，无法据此断言实际扣费。
