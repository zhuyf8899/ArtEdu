# 节点工作流真实执行验收（2026-10-25）

## 结论

平台 API 链路完成真实验收：8 项 HTTP/业务检查与 5 项浏览器检查通过，无模型桩、无请求拦截。数据库、模型供应商、生成产物及页面均为实际运行。GPU/ComfyUI 链路未通过环境验收，原因不仅是缺少在线 Worker，配对桥接入口也被项目停用。

本次启动本机 API（4000）和前端（4173），沿用现有配置与本地演示账号，没有重置密码、初始化数据库或发布工作流。创建的 3 条验收工作流保留为草稿，运行记录真实持久化；不同于之前的事务测试，本次数据没有回滚。生成文件仍受现有临时产物保留策略影响，已另外保存本地验收副本。

## 真实模型任务

直接查询 PostgreSQL 的 generation_jobs 和 usage_records，确认本次共 3 个成功任务：

| 任务 | 实际通道 | 状态 |
| --- | --- | --- |
| 条件选中分支生图 1 次 | model-siliconflow-kolors | succeeded / 用量 success |
| 文字循环第 1 轮 | model-deepseek-v4-flash | succeeded / 用量 success |
| 文字循环第 2 轮 | model-deepseek-v4-flash | succeeded / 用量 success |

未选中的生图分支记录为 skipped，没有额外模型任务。重跑“保存”节点后，生成任务 ID 与原图产物 ID 均保持不变，没有再次调用图片模型。

文字循环实际返回：`开始好` → `开始好好`，验证了上一轮结果进入下一轮调用。

## 逐项结果

| 检查 | 结果 |
| --- | --- |
| 数据库就绪、API 健康与真实登录 | 通过 |
| 草稿保存、指定版本试运行、不发布 | 通过 |
| 动态条件路由＋真实生图 | 通过；另一分支跳过 |
| 产物归档与下载 | 通过；PNG，1,975,003 字节，1024×1024 |
| 下载鉴权 | 本人 200、未登录 401、其他运营账号 403；响应 no-store |
| 输出节点重跑 | 通过；清除下游状态后复用原图，无额外图片调用 |
| 真实文字模型循环两轮 | 通过 |
| 缺少图片输入进入失败分支 | 通过；正常分支跳过 |
| 上传真实图片后重跑恢复 | 通过；正常预览执行，旧错误分支结果失效并跳过 |
| 运行记录持久化与历史读取 | 通过 |
| 页面打开实际工作流与历史图片 | 通过；图片实际加载，naturalWidth > 0 |
| 手机布局 | 无横向溢出 |
| 浏览器错误与重复模型提交 | 页面运行错误 0，查看结果期间新生成请求 0 |

图像链路通过不代表提示词遵循度完全通过：测试要求单朵花、无文字，供应商实际返回多朵花，并带“AI生成”标识。这是本次观察到的模型输出差异，未将其计作画布执行失败。

## GPU 验收阻塞及对前次判断的纠正

此前“已有 GPU 后端，只需连接 Worker”的描述不完整。本次确认：

1. Docker 当前只有 PostgreSQL 容器，状态 healthy。
2. 本机 ComfyUI 8188 端口不可达；实际 `/api/comfy/catalog` 返回 0 个本人已配对在线 Worker、0 种节点。
3. `AppModule` 未导入 `LocalBridgeModule`，因此现有应用没有注册设备配对、Worker 领取和回传所需的 Local Bridge 路由。
4. `services/local-bridge/package.json` 中 configure、pair、run、run:gpu 均指向 `disabled.mjs`；README 明确说明已停用。
5. 检查项目历史默认 ComfyUI 目录时，虽然仍有模型和部分源码，但 `main.py` 缺失，不能作为完整的可启动安装。

因此真实 GPU 生成、GPU 实时进度、GPU 取消与失败重试均未验收，不能把浏览器模拟 Worker 的结果当作实际可用证明。恢复 GPU 需要先确定是恢复已停用的 Local Bridge，还是接入新的 GPU 执行服务，并具备可启动的 ComfyUI 环境。本次保持项目现有停用状态，未擅自重开配对与本地执行能力。

## 证据与复现

- `outputs/workflow-live-20261025/report.json`：真实运行 ID、任务 ID、数据库核对与 SHA-256。
- `outputs/workflow-live-20261025/browser-report.json`：浏览器验收。
- `outputs/workflow-live-20261025/generated.png`：真实生成图片副本。
- `outputs/workflow-live-20261025/live-result-desktop.png`、`live-result-mobile.png`：真实历史结果页面截图。
- `local-artifacts/comfy-local-inventory.json`：本机 ComfyUI 安装只读清单。

```powershell
# 会产生真实模型用量：一次图片生成、两轮文字模型调用。
node scripts/verify-workflow-live.mjs --live

# 仅读取上一次持久化运行并检查页面，不重复调用模型。
node scripts/verify-workflow-live-browser.mjs
```
