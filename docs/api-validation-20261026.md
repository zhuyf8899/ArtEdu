# API 能力真实验收（2026-10-26）

## 结论

DeepSeek 文字、SiliconFlow 生图、百炼万相图片与遮罩编辑均通过真实 API 工作流验收；ModelScope 生图未通过，上游在提交阶段返回 HTTP 403。此次不测试 GPU，也不改变 GPU/ComfyUI 工作流的执行方式。

使用现有本机 API、前端、Docker PostgreSQL 及现有供应商配置，无模型测试桩、无浏览器请求拦截。数据库核对确认本次创建 5 个真实模型任务：4 个成功、1 个失败。没有查询供应商账单，任务记录不等于实际扣费凭证。

## 通道结果

| API 通道 | 实测内容 | 结果 |
| --- | --- | --- |
| DeepSeek V4 Flash | 文字生成循环两轮，上一轮结果传入下一轮 | 通过，两次真实任务成功 |
| SiliconFlow Kolors | 条件选中分支生图、预览、保存、私有下载 | 通过，一次图片任务成功；未选分支跳过 |
| 百炼万相 wanx2.1-imageedit | 私有原图＋透明 PNG 遮罩，经工作流调用编辑接口 | 修复登记缺失后通过，一次编辑任务成功 |
| ModelScope Qwen-Image | 显式选定该通道进行独立生图 | 失败；上游 HTTP 403，平台返回 503；具体权限或额度原因尚未确认 |

## 发现并修复的问题

万相适配器已经在 `MODEL_PROVIDERS_JSON` 中配置，但数据库 `model_configs` 中没有同 ID 的登记。此前独立适配器调用成功不能证明完整工作流可用：真实工作流在生成任务引用检查时返回 404“可用模型配置不存在”，没有向供应商提交任务。

新增并应用 `migrations/0043_bailian_image_edit_model.sql`，登记 provider-bailian 和 model-bailian-wanx-edit。仅保存模型标识及 `env:BAILIAN_API_KEY` 引用，不保存密钥。重复执行两次验证幂等性；已有登记不被覆盖。修复后完整编辑工作流成功。

初次失败报告保留在 `outputs/api-validation-20261026/image-edit/report-before-registration.json`。

## 工作流与权限

- 草稿保存、指定版本试运行及真实记录持久化通过；验收草稿没有发布。
- 动态条件分支只有选中分支调用图片模型。
- 重跑生图与编辑流程的保存节点，均复用原有生成任务及产物，没有重复提交模型。
- 两轮文字循环完成并显示真实结果。
- 缺少图片输入时进入错误分支；上传图片后从输入节点重跑，正常路径恢复，旧错误路径跳过。
- 图片下载本人返回 200、未登录返回 401、其他运营账号返回 403，带 `Cache-Control: no-store`。
- 不同尺寸的遮罩在调用供应商及创建生成任务之前返回 400。
- 生图与编辑结果都通过真实前端历史页面加载与预览，手机无横向溢出，页面运行错误 0；查看期间新模型提交 0。

## 图片编辑质量

原图为 512×512 米白背景、中央红色正方形，透明遮罩指定中央区域。编辑结果仍为 512×512，中央检测区域全部成为蓝色。

抽样检查曾得到遮罩外误差 0；进一步对完整原图逐像素比对发现：217,200 个遮罩外像素中，有 10,668 个存在变化，RGBA 通道平均绝对误差为 0.05168 / 255，主要为轻微边缘变化。因此，不能把本次结果描述为遮罩外全图逐像素不变。当前供应商遮罩编辑仍需按实际模型效果验收；本次没有额外做本地硬合成来掩盖这种差异。

原图、遮罩与结果分别为 `image-edit/original.png`、`mask.png`、`edited.png`。

## 验证与证据

- API 基础工作流：8 项检查通过。
- 图片编辑：4 项检查通过；额外 ModelScope 通道检查失败，整体标记为 partial。
- 实际生图和编辑页面：各 5 项浏览器检查通过。
- 后端完整安全与业务回归：277 / 277 通过。
- 数据库任务审计：`outputs/api-validation-20261026/database-audit.json`。
- 生图与文字循环报告：`outputs/api-validation-20261026/workflow/report.json`。
- 编辑、质量指标与 ModelScope 失败：`outputs/api-validation-20261026/image-edit/report.json`。
- 两个子目录各有 `browser-report.json`、桌面及手机历史页面截图。

复现命令（live 命令会产生真实模型任务）：

```powershell
node scripts/verify-workflow-live.mjs --live --api-only --output=outputs/api-validation-20261026/workflow
node scripts/verify-api-image-edit-live.mjs --live --second-provider
node scripts/verify-workflow-live-browser.mjs --output=outputs/api-validation-20261026/workflow
node scripts/verify-workflow-live-browser.mjs --output=outputs/api-validation-20261026/image-edit
```

## API 当前边界

目前已实测文字、文生图、图片编辑与遮罩编辑。专用超分、LoRA、ControlNet、任意 ComfyUI 原生图的 API 执行，以及 API/GPU 混合节点执行不在此次通过范围内，不能因原生工作流已复刻就宣称这些 API 运算已支持。

下一步可优先核对 ModelScope 账号/密钥的调用权限与额度，再做有针对性的单通道复验；无需重复已成功的任务。
