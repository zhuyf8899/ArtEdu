# 原生 ComfyUI 工作流

原有教学工作流继续使用平台生成 API。新的“新建 ComfyUI 工作流”入口使用真实 ComfyUI 节点、类型化端口、控件和 GPU 采样链路；两种格式不会混用。模型加载、CLIP、LATENT、KSampler 和 VAE 解码由 ComfyUI 执行，不再用图片生成 API 模拟这些节点。

## 已实现

- GPU Worker 从本机 `/object_info` 获取节点和模型选项，上报经过本机白名单筛选的节点定义。无需前端硬编码自定义节点。
- MODEL、CLIP、VAE、CONDITIONING、LATENT、IMAGE 等多输入输出端口；单个输入限制一条连线，前后端验证类型、循环、必填项和数值范围。服务端重新编译图，客户端提交的 `comfyPrompt` 不能替换实际画布。
- 原生 API JSON 导入、导出；UI JSON 支持明确控件顺序的普通节点与连线，KSampler 的种子策略控件有显式处理。
- 参数编辑、平移缩放、小地图、选择、删除、复制粘贴、撤销重做、全图/选中聚焦、分组和版本保存；运行节点高亮。
- PostgreSQL 持久化队列；每账号最多 10 个未完成任务，每设备一次领取一项，设备和任务行锁防止重复领取。
- Worker 主动领取本账号任务，WebSocket 接收实际节点状态、采样进度、缓存事件和图片预览；浏览器每 1.5 秒获取平台状态。
- 取消排队任务、定向中断运行任务、失败/取消后手动重试；重试沿用原版本、模型参数和 Seed，生成新的执行记录。45 秒失去心跳标记失败，不自动重新执行可能仍运行中的任务。
- 最终图片和预览经魔数识别后写入私有存储；仅任务所属账号可读取，单文件 10 MiB、最多 16 张最终图片，预览替换旧文件。

## 本地或服务器准备

1. 在 ArtEdu API 环境执行 `npm run db:migrate`，应用 `0034_comfy_execution.sql`。本次没有修改正式服务器或用户数据库。
2. API 必须开启受控上传并配置 `UPLOAD_ROOT`；HTTPS 或本机隧道访问平台。
3. 登录平台，在“本地 Bridge”中为运行账号创建配对令牌。令牌只写入本机私有环境变量，勿提交 Git。
4. 启动已有 ComfyUI，只监听 `127.0.0.1:8188`。请使用独立实例；旧版 ComfyUI 的 `/interrupt` 是实例级中断。本 Worker 对新版服务传递 `prompt_id`，仍不应与其它使用者共享实例。
5. 在本机 PowerShell 配置以下变量，再运行 Worker：

```powershell
$env:ARTEDU_API_URL = 'http://127.0.0.1:4000/api/'
$env:COMFYUI_BASE_URL = 'http://127.0.0.1:8188'
$env:COMFYUI_DEDICATED = 'true'
# ARTEDU_BRIDGE_TOKEN 由你在本机私有环境中设置。
npm --prefix services/local-bridge run run:gpu
```

`ARTEDU_API_URL` 也可以是服务器 HTTPS 地址或 SSH 隧道地址。平台不接收本机 ComfyUI 地址或模型路径，不向外暴露 8188。Worker 队列范围目前严格限于配对账号；学校 GPU 的多账号共享授权不是本轮功能。

默认允许审核过的基础节点及 LoRA、ControlNet、放大节点。只有本机已安装且模型可用时才上报。额外自定义节点通过本机 `COMFYUI_ALLOWED_NODES` 设置审核后的节点类名，以逗号分隔；不能让浏览器安装 Python 节点。每 30 秒刷新注册信息。

## 兼容边界

- 原生 API 格式是推荐的交换格式。UI 格式的 Reroute、嵌套子图、静音/旁路和无法可靠映射的插件控件目前明确拒绝，要求在 ComfyUI 中导出 API 格式；不会静默换成默认教学图。
- 运行种子采用导入或编辑的具体数值并固化在任务中；UI 的随机/递增策略控件不自动改变种子。
- 图片输出与实时预览已实现；视频、音频、3D 产物、自定义前端扩展、遮罩编辑和完整 ComfyUI Manager 不是本轮支持范围。
- 自定义节点执行的安全性取决于本机维护者的审核。GPU Worker 不安装节点包、下载模型或执行用户提交的脚本。
- 当前上传大小、任务数量和心跳有约束；GPU 用量没有纳入外部模型 API 的计费表。自己的 GPU 队列与外部模型额度分开统计。

## 验证

常规 `npm run check:api`、`npm run check:api:test`、`npm --prefix admin-console run test:platform` 包含新增类型验证、权限隔离和取消竞争测试。`npm --prefix services/local-bridge run test:gpu` 验证本机地址与节点白名单。

`node scripts/verify-comfy-worker.mjs` 用本机测试平台传输及真实 ComfyUI GPU 验证生图、实时采样预览和运行取消。必须先启动专用 ComfyUI；设置 `ARTEDU_QA_OUTPUT` 指向测试输出目录。测试不会登录或修改真实平台账号，但会在 ComfyUI 中运行模型并写出测试图。

`node scripts/verify-comfy-canvas.mjs` 使用本机测试平台数据和真实节点定义验证浏览器画布。设置 `ARTEDU_PLAYWRIGHT_ROOT`、`ARTEDU_BROWSER_PATH`、`ARTEDU_QA_DIST`（已构建前端目录）、`ARTEDU_QA_OUTPUT`。它不调用真实平台写接口。

2026-10-03 的真实 GPU 验证使用 E 盘现有 ComfyUI、RTX 5060 Laptop 8GB 与 MajicMIX checkpoint，完成生图、实时预览及取消。数据库持久化迁移和正式服务器端到端联调仍需在部署环境执行，不能以测试桩结果替代生产验收。
