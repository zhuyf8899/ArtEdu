# ArtEdu 当前工程边界

当前主工程已包含课程与学习空间、案例社区、教学工作流、模型生成、Agent 创作、课程 RAG 和原生 ComfyUI 执行。能力是否可用取决于目标环境的配置、迁移、模型服务及 Worker 状态；学校 SSO 和对象存储直传尚未接入。

## 统一边界

- `admin-console` 包含学生门户和管理后台，通过 `/api` 访问业务，不直接连接数据库。
- `apps/api` 集中处理领域逻辑、身份、权限和数据访问。
- PostgreSQL 保存关系数据、任务、状态、审计、文件存储键和 RAG 文本/向量；二进制文件保存到私有目录或部署数据卷。
- `GenerationService.runJob` 支持服务端执行；Agent 支持服务端执行、流式回复与本地 Bridge 派发。不能假定所有耗时操作都由独立生成 Worker 完成。
- `src/worker.ts` 启动的生成 Worker 当前不领取任务；课程 PDF 索引由独立 RAG Worker 处理，原生 ComfyUI 任务由配对的 GPU Worker 主动领取。

## 开发入口

```powershell
npm run db:prepare
npm run dev
npm run check
```

`npm run dev` 启动 API、前端和生成 Worker；RAG 与 GPU Worker 的启动要求见 [RAG](rag.md) 和 [ComfyUI](comfyui-workflows.md)。

`npm run check` 执行 API 类型检查与后端测试、前端构建及 Worker/创作/平台测试、案例导入和启动可靠性测试；实际清单以根 `package.json` 为准。

迁移以完整文件名记录到 `schema_migrations`，按文件名排序执行。新增文件采用 `数字前缀_描述.sql`，选择新的递增前缀；历史目录存在相同数字前缀的不同文件，不能仅凭数字判断执行状态。已应用迁移保持不变，通过新增迁移修改结构。

## 页面入口

学生端：`/`、`/learning`、`/studio`、`/community`、`/my-learning`、`/search`、`/create`、`/canvas`。

管理端：`/admin`、`/admin/users`、`/admin/courses`、`/admin/workflows`、`/admin/reviews`、`/admin/reports`、`/admin/bridges`。

路由与查询参数处理以 `admin-console/src/routing.js`、`App.jsx` 为准，实际业务权限由后端再次校验。