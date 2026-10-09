# ArtEdu 后端架构

`apps/api` 使用 NestJS、Fastify 和 TypeScript，是学生门户与管理后台的业务入口。模块注册见 `src/app.module.ts`，HTTP 入口见 `src/main.ts`。

## 模块

| 模块 | 职责 |
| --- | --- |
| auth | 本地账号、会话、身份及全局认证守卫；学校 SSO 尚未接入 |
| admin | 用户、额度、审核、举报与管理总览 |
| courses / learning | 课程 CMS、资料访问、选课、进度、学习计划与笔记 |
| portal / knowledge | 首页聚合、统一搜索与知识图谱 |
| studio | 教学工作流、案例作品、社区互动、审核及原生 ComfyUI 执行 |
| generation | 任务、额度、模型适配、执行和产物导出 |
| agent | 模型/工具循环、流式执行、搜索、工作区及产物预览 |
| creation-storage | 创作临时文件与清理 |
| rag | PDF 索引、embedding、权限过滤后的向量检索及转写文本回退 |
| local-bridge | 本地设备配对、心跳和 Agent 任务领取/回传 |
| database / health | PostgreSQL 访问与健康检查 |

模块通常包含 controller、contracts、service 和 module；部分模块另外拆出 repository，其余直接通过 DatabaseService 查询。业务模块使用 Actor 进行权限判断。

## 执行与存储

- API 可创建排队任务，也提供 GenerationService.runJob 和 Agent 服务端执行/流式执行入口。
- `src/worker.ts` 启动 GenerationWorkerService；当前 processOnce 仅记录配置提示并返回 false，不领取或执行任务。
- `src/rag.worker.ts` 启动独立 PDF 索引 Worker，负责解析、切块、embedding 和向量入库。
- 本地 Agent Bridge 与 ComfyUI GPU Worker 主动向平台领取任务；服务器不反向连接用户设备。配置见 [本地 GPU 接入](gpu-worker-integration.md) 与 [ComfyUI](comfyui-workflows.md)。
- PostgreSQL 保存关系数据、状态、审计、存储键和检索文本/向量。二进制文件保存在 API 私有目录或部署卷；对象存储直传尚未接入。

管理端的 limited 是依据额度与进行中任务计算的展示状态，不写回 users.status。last_active 当前取 users.updated_at，不代表登录时间。

## 迁移与运行

以 `migrations/` 和 `schema_migrations` 为数据库结构及执行状态依据；`db/schema.ts` 只是基础表用途索引。

本地启动见根 README 与 scripts/dev.mjs；测试部署进程配置见 docker-compose.staging.yml。启用模型或 RAG 前必须配置对应服务和密钥。生产环境拒绝 ENABLE_LOCAL_AUTH=true，正式身份提供方仍需接入。