# ComfyUI 工作流导入导出

2026-10-21。补齐文件交换，不恢复 GPU、Bridge 或本机推理。ComfyUI 原生图与平台 API 图继续区分；交换文件不等于已接通对应计算能力。

## 入口与格式

在平台节点画布点击“导入 JSON / PNG”，可导入 ComfyUI 文件并切换到原生图交换画布。无需在线 Worker。该画布可编辑位置、连线、已知参数并保存草稿；历史原生图同样提供导出按钮，仅读模式也可下载。

导入支持：

- API JSON：裸节点映射及 `{ "prompt": ... }` 包装，按名称保留参数、输入连线、自定义节点类型和 `_meta`。
- 标准 UI JSON 0.4 和 1.0：数组或对象连线、节点位置／尺寸／标题／属性、命名或顺序控件、画布视角、分组和种子策略。无元数据的顺序插件控件保持原始数据，不猜测顺序。
- 平台备份：保留交换来源和节点元数据，保存到服务端后再次打开仍能继续导出。
- ComfyUI 生成 PNG：读取 `workflow` / `prompt` 的 tEXt、zTXt、iTXt 文本元数据。优先保留 UI 布局，同时有 API 元数据时保留命名输入；不解析或运行图片中的脚本，不请求外部地址。

导出按钮：

| 按钮 | 结果 |
|---|---|
| 导出 ComfyUI 0.4 | ComfyUI 可读取的标准 UI 工作流，使用数组连线 |
| 导出 ComfyUI 1.0 | 标准 UI 工作流，使用对象连线和 state 计数 |
| 导出 API JSON | 以 `class_type` / `inputs` 描述节点的 API prompt |
| 平台备份 JSON | 平台自用的完整画布与交换来源，不冒充标准 ComfyUI 格式 |

API JSON 不包含画布布局，需保存 UI JSON 或平台备份来保留排版。图片、模型、LoRA 文件不会打包进 JSON，文件名仅为资源引用。

## 无损与限制

- 普通已知节点按真实节点定义映射参数，保存标题与种子 fixed/randomize 等策略，不将策略误写为 steps 等相邻参数。
- 原 UI 的插件属性、子图定义、静音／旁路状态和未知控件保留到 UI 导出。保留不是执行实现；不能安全转换时拒绝导出 API JSON，提示改用 UI 文件或先在 ComfyUI 展开子图。
- 新版独立转接点及其链接附加字段保留；无法可靠重写的新版转接布局需要保持原格式和连线，或先在 ComfyUI 展开再转换，避免损坏隐藏路由。
- 正常节点定义可解析的 Reroute 链在平台内部折叠；连线未改动时导出恢复原始 Reroute 拓扑。改动连线后导出当前实际连线，不伪造旧连接。
- PNG 同时含 UI/API 元数据时，原始 UI 控件数组与命名 API 参数均保留。若缺少控件顺序定义，修改命名参数后可导出 API；UI 导出会明确拒绝将修改值写到未知数组位置。
- 不支持的插件前端控件不执行，不能保证任意第三方插件都能在平台内交互编辑。结构损坏、重复 ID、悬空／循环连接、重复输入和异常端口会拒绝导入。
- 文件上限 8 MiB；解析后 JSON 或 PNG 文本元数据、以及保存的完整画布各不超过 750 KB；压缩文本按解压后大小限制。沿用最多 80 节点、160 连线和 20 个可编辑分组的边界。
- 不支持 PNG 图片导出或自动把任意原生采样图转换成平台 API 运算图。本轮不调用模型，也不下载插件或模型。

## 验证

- `node --test admin-console/tests/comfy-graph.test.mjs`：API/UI 往返、离线未知节点、分组、位置、种子策略、Reroute、子图／旁路保留、PNG 三种文本类型、解压上限及损坏输入。
- `node scripts/verify-comfy-exchange.mjs`：隔离 Chrome 操作真实 ComfyCanvas，上传标准 UI 文件，点击四个导出按钮，检查实际下载文件的参数、端口、属性与格式，无 GPU 或模型调用。证据在 Git 忽略的 `outputs/comfy-exchange-qa/`。
- 后端回归覆盖交换来源经输入契约、JSON 持久化形状和读取归一化后的保留。

格式依据：[ComfyUI Workflow JSON 1.0](https://docs.comfy.org/specs/workflow_json)、[Workflow JSON 0.4](https://docs.comfy.org/specs/workflow_json_0.4)。
