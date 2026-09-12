# ArtEdu

清华美院 AI 艺术教育平台。第一阶段工程框架已完成，当前仓库可以在本地同时运行 PostgreSQL、NestJS API、生成任务 Worker 和 React 测试门户/管理后台。

## 当前已实现

- PostgreSQL 数据模型、版本化迁移、演示种子数据和 Docker Compose。
- NestJS + Fastify API，包含开发身份回退、角色权限、输入校验、事务和审计记录。
- 首页聚合、生成任务排队与查询基础接口。
- 课程目录、课程详情、选课、课时进度，以及完整的“我的学习”空间。
- 管理端课程创建、课时配置、发布审核与课程上线流程。
- 管理端用户查询、日/月/并发额度调整、账户启停和作品审核接口。
- 工作流目录、版本发布、逐步执行和学习进度留痕。
- 案例社区投稿、外部资源登记、审核发布、评论、点赞与收藏。
- 全站统一搜索，覆盖教学资源、工作流与案例社区，并提供内容类型和标签组合筛选。
- 全站统一操作反馈、危险操作确认和可重试加载状态；首页创作输入支持按账号自动保存草稿。
- React 测试门户与管理后台，支持学生、教师、运营和管理员四种演示身份。
- 根目录统一启动/检查命令，以及 GitHub Actions CI。

本阶段不包含学校 SSO、真实大模型调用和对象存储文件直传。工作流与作品业务已可在不依赖模型 API 的情况下完整演示；作品暂以安全的 HTTP(S) 资源链接登记，接入对象存储后替换上传适配器。详细边界见 [`docs/framework.md`](docs/framework.md)，接口状态见 [`docs/api-contracts.md`](docs/api-contracts.md)。

学校 SSO 尚不可用时，可在受控测试环境以本地账号完成课程文件上传、选课与受控视频播放；PDF、Word、PPT 不对学生端开放原件。具体规则见 [`docs/pre-sso-file-access.md`](docs/pre-sso-file-access.md)。

## 上线部署前置条件（尚未完成）

以下事项尚未配置或接入，因此当前版本仅适合本地开发、联调和校内测试，**不能作为公网正式环境直接部署**：

- 学校 SSO 或受管身份提供方尚未接入。生产环境会拒绝 `ENABLE_LOCAL_AUTH=true`，本地测试账号不能作为正式登录方式。
- 学校云服务器、DMZ 网络策略、域名、TLS 证书、HTTPS 反向代理和正式 `CORS_ORIGIN` 尚未落实。
- 验证码、MFA 和统一风险控制尚未接入；应优先由 SSO 或接入层提供，而非在应用内保留独立的生产密码入口。
- 本地限流只适用于单进程。多实例或公网部署前应在网关/Redis 配置共享限流、WAF 和登录异常告警。
- 当前上传文件使用 API 私有目录。生产环境需指定学校托管的 `UPLOAD_ROOT`，并补充对象存储、恶意文件扫描、备份与保留策略。
- 真实模型 API、国产模型合规验证、密钥管理和调用额度策略尚未配置；`MODEL_EXECUTION_ENABLED` 应保持为 `false`，直到这些条件满足。

## 环境要求

- Node.js 22
- npm 10+
- Docker Desktop（用于本地 PostgreSQL 16）

## 首次安装

```powershell
cd apps/api
Copy-Item .env.example .env
npm ci

cd ../../admin-console
Copy-Item .env.example .env.local
npm ci

cd ..
npm run db:prepare
```

Docker Compose 只负责 PostgreSQL 容器和数据卷；数据库结构必须由 `db:migrate` 统一管理，避免初始化脚本和版本化迁移重复执行。

`.env.example` 中只允许出现本地演示配置。真实数据库密码、模型密钥和学校认证凭据不得提交到 Git。本地联调时可设置 `ENABLE_LOCAL_AUTH=true`，再通过 `auth:provision-local` 为指定演示用户配置临时密码；生产环境会拒绝本地认证开关，必须接入学校 SSO/OIDC 或受管身份提供方。

## 启动

启动命令会自动查找 Docker Desktop、等待数据库健康并应用迁移，再启动应用。只检查依赖可执行 `npm run db:check`；故障排查与数据保护说明见 [Docker 启动说明](docs/docker-startup.md)。

在仓库根目录执行：

```powershell
npm run dev
```

也可以直接双击 `scripts\start-local.cmd`（等价于 `powershell -ExecutionPolicy Bypass -File scripts\start-local.ps1`）。它会自动完成依赖安装、Docker/PostgreSQL 启动、迁移、演示数据、演示账号检查，再启动服务并做一次健康检查与真实登录验证，最后打印入口地址；停止用 `-Stop` 参数。首次在未安装 Docker Desktop 的机器上运行仍需先安装 Docker Desktop。

启动后可访问：

| 服务 | 地址 |
| --- | --- |
| 测试门户与管理后台 | `http://localhost:4173` |
| API | `http://localhost:4000/api` |
| 健康检查 | `http://localhost:4000/api/health` |

前端首先显示受控的本地账号登录页。教师、运营和管理员账号可进入 `/admin`，学生账号仅能访问学习与创作空间。

“我的学习”页面位于 `/my-learning`，提供学习首页、我的课程、学习计划、学习笔记、收藏案例和我的作品六个业务视图。学习计划与笔记会通过 API 持久化到 PostgreSQL；课程进度、收藏、作品和工作流记录来自现有业务数据，不使用静态占位数据。

首页 AI 创作区会读取当前账号的日/月/并发额度和模型服务状态。模型尚未启用或请求失败时不会伪装成功，未提交的输入会保存在当前浏览器的账号隔离草稿中；任务创建成功或用户主动清空后草稿会被删除。

统一反馈、确认和降级状态的实现边界见 [`docs/ux-feedback-polish.md`](docs/ux-feedback-polish.md)。

用明文 HTTP 的 IP 地址部署时，浏览器会禁用部分只在安全上下文存在的 Web API（例如 `crypto.randomUUID`），这类问题在本地 `localhost` 复现不出来，说明见 [浏览器运行时注意事项](docs/browser-runtime-notes.md)。

## 验证

```powershell
npm run check
```

该命令执行 API TypeScript 类型检查、前端生产构建和静态站点 Worker 测试。PR 和推送到 `main` 时，GitHub Actions 会执行相同检查。

## 本地调试记录（2026-09-02）

本次在 `D:\ArtEdu` 的 `main` 分支执行了以下验证：

```powershell
npm run check:api
npm --prefix apps/api run test:security
npm run check
```

结果：

- API TypeScript 类型检查通过；
- API 安全测试 13 项全部通过，覆盖本地登录限流、密码摘要、生产 CORS、路径穿越、私有上传、课程资料和工作流输入校验；
- 前端 Vite 生产构建通过，Sites Worker 测试 4 项全部通过；
- 学生端和管理端业务页已按路由懒加载，生产构建不再产生超过 500 kB 的 JavaScript chunk 警告。

数据库联调尚未在本次环境完成：当前终端无法调用 `docker` 命令，因此未能执行 PostgreSQL 容器启动、迁移和种子数据验证。Docker CLI 可用后，在仓库根目录执行：

```powershell
npm run db:prepare
Invoke-WebRequest http://localhost:4000/api/health
npm run dev
```

数据库验证应至少确认 `schema_migrations` 已记录 `0001` 至最新迁移、演示账号可登录，以及课程、学习空间、工作流和作品审核接口均能读写 PostgreSQL。

## 主要目录

```text
admin-console/       React 测试门户与管理后台
apps/api/            NestJS API 与生成任务 Worker
migrations/          PostgreSQL 版本化迁移
seed/                本地演示数据
docs/                框架边界与 API 契约
scripts/dev.mjs      多进程本地启动入口
```

## 数据与文件边界

PostgreSQL 保存用户、权限、课程、工作流、额度、任务、作品状态、审计信息和对象存储键。图片、视频、PDF 等二进制文件后续进入学校提供的 S3 兼容对象存储，不直接写入数据库。

## 课程资源业务

主工程已经通过 `0003_course_resource_business.sql` 和 `apps/api/src/modules/courses` 接入第一阶段正式能力：课程 CMS、发布审核、用户选课、学习进度、工作流课时和生成结果关联。前端正式入口为 `/learning` 与 `/admin/courses`。

[`prototypes/course-resource-mvp`](prototypes/course-resource-mvp) 继续保留为业务验收和迁移对照，不参与主工程构建。迁移边界、接口清单和模块映射见 [`docs/course-resource-business-integration.md`](docs/course-resource-business-integration.md)。

## 我的学习业务

“我的学习”由 `0007_learning_space_business.sql`、`apps/api/src/modules/learning` 和 `admin-console/src/MyLearning.jsx` 共同实现。它在课程进度之上聚合本周学习时长、待办任务、学习笔记、收藏案例、个人作品与工作流执行记录，并提供任务和笔记的增删改能力。视觉验收记录与桌面/窄屏对比证据见 [`design-qa.md`](design-qa.md)。

## 创作入口与创作对话

创作流程分成“起始页说清需求”和“专用页面阅读长文”两段，避免长回复把首页撑开：

- 起始页（`/`，`admin-console/src/AiCreationConsole.jsx`）只保留需求输入、创作能力、模型与搜索开关。创作能力收在一个 42px 圆形按钮里（`admin-console/src/CapabilityPicker.jsx`），点开才展开列表，不再把多个能力按钮并排堆在控制条中。
- 提交后先把需求写入本机对话记录，再跳转到 `/create` 专用阅读页（`admin-console/src/CreationWorkspace.jsx`）。左侧是历次对话，右侧是长文本阅读区与继续输入的输入框。
- 对话记录保存在浏览器 IndexedDB（`admin-console/src/conversationStore.js`），按账号隔离并自动压缩超长对话；服务端只记录生成任务、额度和审计。临时参考文件由 `creation-storage` 模块管理，默认 72 小时未活动自动清理（`TEMPORARY_UPLOAD_RETENTION_HOURS`、`TEMPORARY_UPLOAD_QUOTA_MB`）。

视觉验收证据见 [`design-qa-creation.md`](design-qa-creation.md)。
