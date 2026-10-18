# 工作流功能审查（2026-10-18）

后续修复与验证见 [工作流交互与执行修复](workflow-repair-20261018.md)。本文保留为修复前的审查快照，其中隔离复现脚本断言针对当时的错误行为；当前版本应使用后续报告中的回归脚本。

## 结论与范围

当前具备画布编辑、导入导出、版本保存/发布、平台文字与图片节点执行、参考图上传、执行历史，以及原生 ComfyUI 的画布和队列代码。可以支持基本线性创作，但不能认定功能闭环全面或没有隐藏 bug。

本次共记录 9 项问题：4 项已用实际服务方法隔离复现；其余由当前代码调用链、SQL 和模块注册确认，未进行真实 PostgreSQL 并发压测或 GPU 端到端验证。没有修改业务实现、账号、数据库或模型配置。

验证结果：前端工作流/Comfy 图/模板测试 20 项通过；后端工作流执行/契约/Comfy 契约及服务测试 35 项通过；GPU Worker 单元测试 1 项通过；API TypeScript 类型检查通过。既有测试通过不能覆盖以下异常路径。

## 问题清单

### 1. [P1] 原生 ComfyUI 功能入口仍开放，执行依赖已停用

- 位置：`admin-console/src/WorkflowAdmin.jsx:315`、`apps/api/src/app.module.ts:28`、`services/local-bridge/package.json:9`、`services/local-bridge/disabled.mjs:1`。
- 当前前端仍允许新建、保存和运行原生工作流，`StudioModule` 仍注册 Comfy 接口。但 `AppModule` 没有导入 `LocalBridgeModule`，Worker 的配对、注册、领取和回传路由不会注册；`run:gpu` 也只执行停用脚本并退出。
- 影响：全新部署无法通过正常流程建立在线 Worker，原生发布/运行会失败。数据库中短期残存的在线记录也不能补齐领取和回传链路。
- 建议：按当前“停用 Bridge、统一云端”的产品决策收起原生创建和运行入口，并明确已有原生图的状态；若仍需要原生 GPU 功能，需恢复配套执行服务后完整验收。此处不能仅靠修改按钮或旧文档解决。
- 证据级别：模块与启动链路静态确认；未尝试恢复已停用服务。

### 2. [P1] 分支汇合会静默丢失一条分支的提示词

- 位置：`apps/api/src/modules/studio/studio.service.ts:858–870`。
- 复现图：输入“主题”分别连接提示词 A“红色”和 B“圆形”，A、B 同时连接预览。
- 实际结果：先放 A 的连线再放 B，预览为“主题\n圆形”；只颠倒汇入连线顺序，结果变成“主题\n红色”。图可以保存、运行完成，但其中一个约束完全丢失。
- 原因：`mergeNodeStates` 对每条上游完整状态按连线顺序逐字段赋值，后者覆盖前者。尺寸、模型、图片等字段同样采用此规则，继承来的默认值也可能覆盖另一分支的显式设置。
- 建议：明确字段合并语义；提示词按来源合并并避免重复公共祖先，尺寸/模型等单值冲突应报错或要求明确选择，避免依赖连线数组顺序。
- 证据级别：已隔离复现，两种连线顺序均验证。

### 3. [P1] 教师等角色看到的版本与点击运行的版本可能不同

- 位置：`apps/api/src/modules/studio/studio.service.ts:134–153`、`:264–279`，`admin-console/src/ComfyCanvas.jsx:207–215`。
- 触发：其他作者的工作流 V1 已发布，V2 是草稿；教师/运营/管理员从公共目录打开并运行。
- 读取详情只向非作者返回已发布 V1；启动接口却对所有发布角色开放最新草稿，并按版本号选择 V2。启动请求只有工作流 ID，没有期望版本 ID。
- 影响：用户检查的是 V1，执行的却可能是 V2；原生画布尤其会继续显示详情图，而任务实际使用另一版本。即使允许这些角色试运行草稿，也应是明确选择后的动作。
- 建议：启动接口接收并验证不可变版本 ID，把正常运行和草稿试运行意图区分；详情、运行画布与队列都绑定同一版本。
- 证据级别：两条 SQL 的角色条件与前端调用链静态确认，未执行真实账号联调。

### 4. [P1] 20 分钟过期只清内容、不结束任务，会留下无法推进的任务

- 位置：`apps/api/src/modules/cloud-cache/cloud-cache.service.ts:39–40`，`apps/api/src/modules/studio/studio.service.ts:323,347,820`，`apps/api/src/modules/studio/comfy.service.ts:40,48,53,56,106`。
- 平台图：过期后上下文被清空，`executeRun` 拒绝继续，但记录仍为 `in_progress`；前端历史仍可显示“进行中”，重试也无法恢复。
- 原生队列：排队超过 20 分钟的任务被详情/列表过滤，prompt 被清空，但 `expire` 只处理 running/cancelling，旧 queued 任务仍被并发计数和领取 SQL 计入。积累 10 个这样的任务可持续阻止该账号提交新任务。
- 影响：界面状态与实际能力脱节；在原生功能恢复后还会影响队列容量。20 分钟保留策略本身可以保留，问题在于缺少配套终态转换。
- 建议：在清除执行数据的同一事务中结束过期任务并释放执行锁/队列容量；读取时返回明确过期原因，前端提供新建运行入口。仍在执行的任务需要明确的截止与取消规则。
- 证据级别：清理、状态检查、过滤、计数及领取 SQL 静态确认，未等待真实任务过期。

### 5. [P2] 手动完成/跳过说明节点后，下游永久等待上游状态

- 位置：`apps/api/src/modules/studio/studio.service.ts:321–342`、`:858–861`。
- 复现：输入 → note → 预览；正常执行输入，再通过 progress 接口 complete note，最后执行预览。
- 实际结果：进度已进入预览，但接口返回“上游节点尚未全部执行”。skip 同样没有写入上游状态。
- 原因：`updateRun` 推进 current_step，但不写 note 的 `nodeStates`；后续汇合严格要求每个父节点存在状态。
- 建议：所有推进路径共用执行状态持久化逻辑，或将说明节点从数据依赖中明确折叠。该问题通过现存 progress API 可触发，当前自动执行路径通常不会触发。
- 证据级别：已调用实际 `executeRun`、`updateRun` 隔离复现。

### 6. [P2] 发布校验接受必然执行失败的节点组合

- 位置：`apps/api/src/modules/studio/studio.service.ts:396–411`、`:951–953`。
- 复现：输入 → save_image，无任何生成节点。
- 实际结果：`assertExecutableDefinition` 通过；执行到保存必然报“保存图片前必须先完成图片生成”。空 prompt/skill 的必填内容也没有在该发布检查中检查。
- 影响：已发布不代表基本数据依赖成立，使用者运行时才发现缺失必需节点或参数。
- 建议：补充节点输入输出能力与必填值校验，至少检查保存图片的上游是否存在可达图片产物；区分草稿结构合法与发布可执行两层验证。
- 证据级别：已隔离复现。

### 7. [P2] “默认图片模型”节点不会重置已有模型选择

- 位置：`apps/api/src/modules/studio/studio.service.ts:898–902`。
- 复现：上游设置显式图片模型，下游再放一个值为空的 model 节点。
- 实际结果：节点输出标记 `internal-default`，但执行上下文仍保留上游显式模型 ID；后续图片节点继续使用旧模型。
- 影响：显示与实际调用不一致，可能影响画质、能力和费用预期。
- 建议：默认模型节点应清除上下文中的显式覆盖，或返回实际保留的模型并调整节点说明；选定一种一致语义。
- 证据级别：已调用实际节点执行方法隔离复现。

### 8. [P2] 并发保存同一工作流可能争用同一版本号

- 位置：`apps/api/src/modules/studio/studio.service.ts:251–259`，`migrations/0001_initial.sql:167`。
- 两个标签页同时保存时，事务中的 `MAX(version_number)+1` 都可能读取到相同版本号。事务没有锁定父工作流行，数据库唯一约束会使其中一次插入失败。
- 影响：一次保存/发布报错；唯一约束保护了版本数据，但没有提供可正常完成的并发保存行为。
- 建议：取号前锁定所属 workflow 行，或使用可靠版本计数器/有界冲突重试。
- 证据级别：SQL 并发条件静态确认；未运行 PostgreSQL 并发复现。

### 9. [P2] 目录只有第一页，超过 20 个工作流后部分记录没有浏览入口

- 位置：`apps/api/src/modules/studio/studio.contracts.ts:13–14`，`admin-console/src/WorkflowStudio.jsx:33`、`admin-console/src/WorkflowAdmin.jsx:206`、`admin-console/src/services/adminApi.js:223`。
- 后端默认 pageSize=20，目录和管理页只取一次第一页，没有分页/加载更多；公共工作流目录也没有工作流检索控件。
- 影响：记录增加后，较早工作流在正常目录浏览中不可见；知道 ID 直接访问或使用全站搜索是另外的路径，不能替代目录完整浏览。
- 建议：目录与管理列表补充分页、总数和检索，并验证第 21 条数据可发现。
- 证据级别：分页契约与前端列表读取/渲染静态确认，未创建额外业务记录。

## 功能完整性判断

| 能力 | 当前判断 |
| --- | --- |
| 平台线性节点图编辑、保存和自动推进 | 已有实现，正常链路单测通过 |
| 文本/图片模型、参考图与结果展示 | 已有实现，本次未调用真实模型 |
| 草稿、发布及不可变版本保存 | 已有实现，运行版本选择和并发取号待修复 |
| 分支/汇合 | 允许建图，但合并语义不可靠 |
| 过期、失败、恢复、取消 | 平台运行缺少完善终态与恢复闭环；原生队列有部分机制 |
| 原生 ComfyUI 编辑/导入/参数/队列 | 代码与测试仍在，执行所需 Bridge 已停用，当前不形成完整运行链路 |
| 历史版本查看与回退 | 有版本记录，当前界面没有完整的指定版本运行/回退流程 |
| 规模化目录浏览 | 缺少分页闭环 |
| 通用条件分支、循环、失败分支、节点级重跑 | 当前不是通用工作流引擎；若产品需要这些能力，应列为功能需求，不能仅以现有 DAG 画布视为已支持 |

建议顺序：先处理 1–4，再处理 5–9；针对这些场景补充行为测试。发布分离前端测试主要检查源码字符串，无法证明跨角色、跨版本或异常恢复行为正确。

## 隔离复现

脚本：`apps/api/scripts/audit-workflow-20261018.ts`。

从仓库根目录执行：

```powershell
& ./apps/api/node_modules/.bin/tsx.cmd apps/api/scripts/audit-workflow-20261018.ts
```

脚本调用真实 StudioService 方法，使用内存数据库桩验证问题 2、5、6、7。断言针对本次发现的错误行为，用于确认缺陷存在；它不是修复后的正确性回归测试。修复时应反转为期望行为断言。脚本不访问网络、数据库或真实模型。

本次验证命令：

```powershell
node --test admin-console/tests/workflow-publish-separation.test.mjs admin-console/tests/comfy-graph.test.mjs admin-console/tests/comfy-presets.test.mjs
& ./apps/api/node_modules/.bin/tsx.cmd --test apps/api/src/modules/studio/workflow-execution.test.ts apps/api/src/modules/studio/studio.contracts.test.ts apps/api/src/modules/studio/comfy-contracts.test.ts apps/api/src/modules/studio/comfy.service.test.ts
npm --prefix apps/api run typecheck
npm --prefix services/local-bridge run test:gpu
```
