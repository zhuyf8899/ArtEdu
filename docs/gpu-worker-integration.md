# GPU Worker 接入：本机优先、可替换的执行层

## 目标与边界

ArtEdu 的门户服务器（当前 `8.212.153.167`）只负责身份、工作流版本、排队、审计、资产授权和状态展示；**不运行 ComfyUI、PyTorch、模型或自定义节点代码**。

图像/视频等 GPU 请求由 Worker 主动从服务器领取。第一台 Worker 是维护者的 Windows 电脑；之后学校 GPU、云 GPU 或其他授权电脑使用完全相同的契约接入。服务器不需要、也不应当保存任何 Worker 的模型 API Key、Windows 登录凭据或局域网地址。

```text
浏览器 → ArtEdu API（服务器） → 持久化的工作流任务
                                      ↑             ↓
                    HTTPS / SSH 隧道  本机 GPU Worker → ComfyUI :8188
                                      ↓
                              产物元数据、日志与受控上传
```

本机是主动请求任务的一方。不要把电脑的 8188 端口暴露到公网，不要让服务器反向访问家庭/校园电脑。

## 当前已可用的基础

- Local Bridge 已有短期令牌、哈希存储、心跳、撤销与“本机主动领取”的安全边界。
- 管理台“本地 Bridge”页可以创建名为“我的电脑 GPU Worker”的一次性配对令牌。
- 当前 Bridge **仅实际领取 Agent 文本任务**；工作流节点调度、Comfy 任务格式、文件回传尚未实现。配对入口是 GPU Worker 的安全基础，不代表 ComfyUI 工作流已可执行。

## 本机部署方式

1. 在 Windows 电脑安装 NVIDIA 驱动、与驱动匹配的 PyTorch/CUDA 运行环境及 ComfyUI；模型和自定义节点只存放在电脑本地受控目录。
2. ComfyUI 只监听回环地址，例如 `127.0.0.1:8188`。不要使用 `--listen 0.0.0.0` 暴露给局域网或公网。
3. 在 ArtEdu 管理台创建配对令牌；只复制进本机的私有环境变量，例如：

```powershell
$env:ARTEDU_BRIDGE_TOKEN = "一次性配对令牌"
$env:COMFYUI_BASE_URL = "http://127.0.0.1:8188"
```

4. 服务器 Web 只绑定在回环地址时，在电脑上建立 SSH 隧道：

```powershell
ssh -N -L 18080:127.0.0.1:8080 surecat@8.212.153.167
```

GPU Worker 再访问 `http://127.0.0.1:18080/api`；它通过隧道主动领取任务。令牌、模型路径和 ComfyUI 地址都不能提交到仓库。

## 即将实现的统一 Worker 契约

工作流执行层必须只依赖以下逻辑接口，而不是直接依赖 ComfyUI：

```ts
interface GpuWorkerAdapter {
  capabilities(): Promise<WorkerCapabilities>;
  submit(job: WorkflowExecutionRequest): Promise<RemoteExecution>;
  status(remoteExecutionId: string): Promise<NodeExecutionUpdate>;
  cancel(remoteExecutionId: string): Promise<void>;
}
```

`ComfyUiAdapter` 是第一种实现：把已校验的节点图转换为 Comfy 的任务图，监听执行状态并把允许展示的产物回传。将来可增加 `SchoolGpuAdapter`、`CloudGpuAdapter` 或其他受控执行器，业务工作流服务不改动。

每个 Worker 必须声明能力：GPU/显存、允许的模型、节点版本、最大并发、支持媒体类型和当前负载。调度器只向满足能力与用户权限的 Worker 派发任务。

## 多 GPU 接入规则

1. 每一台 GPU 主机拥有独立 Bridge 设备 ID 和独立令牌；不能共享令牌。
2. 令牌只允许领取所属租户/授权范围的任务；管理员撤销后立即失效。
3. 只允许审核过的模型与节点包。禁止把用户上传的 Python 节点直接安装到 Worker。
4. 每次运行固化工作流版本、节点版本、模型版本、Seed、输入资产哈希和输出资产哈希，保证可追溯与复现。
5. Worker 只上传结果和必要的日志摘要；提示词、源文件、生成结果按课程/作品权限保存。
6. Worker 无心跳或执行超时后，任务进入可诊断的 `failed` 或 `retryable` 状态；不得伪造“已完成”。

## 实施顺序

1. 扩展 Local Bridge 为 GPU Worker 注册、能力上报及工作流任务领取。
2. 建立工作流执行任务、节点运行、产物和日志的数据表/API。
3. 实现本机 `ComfyUiAdapter` 与受控文件回传，完成文生图最小链路。
4. 增加图生图、LoRA、ControlNet、队列、取消、重试和实时预览。
5. 接入第二台 GPU；以能力路由验证 Worker 可替换性，再扩展视频/3D 等重任务。

## 禁止事项

- 不在门户服务器上安装 ComfyUI 或把 `8188` 暴露到公网。
- 不在数据库、前端包、Git、截图或聊天记录中保存 Bridge 令牌、模型密钥或本机路径。
- 不让 Worker 执行未审核的自定义 Python 节点、Shell 命令或任意 URL 下载。
