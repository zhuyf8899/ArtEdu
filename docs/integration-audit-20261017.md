# 前后端接入核对（2026-10-17）

## 版本与范围

已成功 fetch origin。远端 main 为 `686c43d`，当前 `deploy/server-main-safe` 为 `f711e26`；`HEAD..origin/main` 无提交，main 已包含在当前分支。未合并其他远端功能分支、未改业务代码、未执行迁移或部署。本次为源码与部署配置审查，不代表登录态端到端验收。

当前有 React 主界面与 `/morph/` 独立接入页面两条实现。后者已有的服务端保存能力不能视为前者已经接通。用户端图谱按后续明确要求退出 MORPH 主入口，不列为待恢复缺陷。

## 接入矩阵

| 功能 | React 主界面现状 | 后端及缺口 | 优先级 |
| --- | --- | --- | --- |
| 登录、角色、额度 | 已接现有认证及账户服务 | 会话持续性仍需复测；不重建认证 | P0 验收 |
| 课程目录、详情、选课、进度、资料 | 已接 courses 与既有课时业务 | 新目录13门中3门试学、10门筹备，内容安装和审核状态需目标库核实，非所有目录均可学习 | P0 内容验收 |
| 案例、精选、收藏、投稿与审核 | 已接 works、作品收藏和原后台 | 实际精选数量、媒体可访问性及审核读写需验收 | P0 验收 |
| 工具目录及工作流 | 目录链接和原工作流入口已接 | 官网导航不等于工具 API 集成；ComfyUI 实跑取决于 GPU Worker | P0 验收 |
| 我的空间课程/计划/笔记/作品/案例收藏 | 已接真实学习聚合及作品接口 | 非静态占位；需账号隔离、刷新恢复验收 | P0 验收 |
| 个人资料、头像、封面 | MorphMySpace 仍用默认封面及文字头像，无编辑保存入口 | me/morph-state 的 profile 已有；需接 React，核对字段及图片限制 | P0 适配 |
| 工具推荐草稿 | ToolRecommendationDialog 仅 localStorage | tool-submissions 已有服务端个人草稿；需接读写、冲突及失败恢复。公共投稿审核仍需独立业务 | P0 适配 |
| 课程/工具收藏 | 主界面缺完整收藏闭环，空间只有案例收藏 | morph-state favorites 可复用；需核对类型和真实资源 ID，与作品收藏区分 | P1 |
| 课程体系 | CurriculumComposer 规则推荐，保存为学习笔记 | 服务端 curriculum-paths 已有；缺统一路径列表、编辑/删除/恢复及入口承接 | P1 |
| Remix | React 案例详情未接独立页面已有的 Remix 链路 | remixes 状态已有；需 sourceCaseId、保存、恢复和带入创作入口 | P1 |
| 创作对话 | 原 Agent 流式执行保留；历史在 IndexedDB | 独立页面 creation-records 已有；需定义主界面会话持久化范围、大小限制及显式迁移策略，不自动覆盖旧历史 | P1 |
| 专业画像 | 展示真实学习证据 | 尚无专业能力评分依据；不能把进度直接换算雷达分数 | P2，需需求 |
| AI 推荐与工具公共投稿 | 课程体系为规则推荐，工具推荐为私有草稿 | 模型编排、公共审核队列尚非完整能力 | P2，需需求 |

## 实施顺序与验收

1. React API 层增加 me/morph-state 读取与版本化写入适配，复用后端账号隔离及乐观锁。先接个人资料和工具推荐。
2. 接课程/工具收藏、课程体系、Remix；保留案例收藏原业务表。避免继续扩大两套实现差异。
3. 明确创作历史同步范围再接 creation-records；不把有总量限制的 JSON 状态当作无限会话数据库。
4. 用有效账号验证保存、刷新恢复、其他账号不可见、旧版本冲突、服务失败保留输入。验证目录、资料、案例媒体和工作流入口。付费模型与 GPU 实跑单独记录。
5. 核对目标环境迁移和 catalog 安装；安装器会归档指定旧课程/工具，应单独核对发布计划。

## 服务器评估所需证据

docker-compose.staging.yml 包含 PostgreSQL/pgvector、API、Nginx、embedding（ONNX bge-base 中文模型）和 rag-worker；GPU 生成应单独核对 Worker 拓扑。当前 Compose 未设容器 CPU/内存上限。deploy-lowmem.sh 记录过约1.6G主机，部署脚本明确记录低内存与 swap 配置问题，因此不能沿用会议“两核2G即可稳定”的结论。

后续测量：空闲/目录访问/并行流式对话/RAG检索与资料索引/上传/部署构建各场景的容器峰值RSS、CPU、宿主可用内存、OOM与swap、数据库连接、磁盘增长、API错误率与P95。日活不等于峰值并发；需区分在线人数、同时发请求、模型生成并发及供应商额度。公网媒体流量需另测带宽。

本报告不提供稳定容量承诺。应分别评估外部模型+外部embedding的轻量部署、本机embedding完整部署、独立GPU Worker三种拓扑；服务器规格以目标机实测和压测结果确定。

## 主要源码依据

- admin-console/src/services/adminApi.js：主界面现有业务请求。
- admin-console/src/morph/MorphMySpace.jsx：默认资料、学习证据与空间页签。
- admin-console/src/morph/ToolRecommendationDialog.jsx：浏览器草稿。
- admin-console/src/morph/CurriculumComposer.jsx：课程路径写学习笔记。
- admin-console/src/CreationWorkspace.jsx、conversationStore.js：主界面对话历史。
- apps/api/src/modules/morph/morph.module.ts：GET me/morph-state、PUT me/morph-state/:key、按用户查询及版本冲突。
- admin-console/public/morph/connected-*.js：独立页面可复用接入逻辑。
- docker-compose.staging.yml、deploy/deploy-staging.sh：部署服务与内存保护。
