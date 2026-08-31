# ArtEdu

清华美院 AI 艺术教育平台。第一阶段工程框架已完成，当前仓库可以在本地同时运行 PostgreSQL、NestJS API、生成任务 Worker 和 React 测试门户/管理后台。

## 当前已实现

- PostgreSQL 数据模型、版本化迁移、演示种子数据和 Docker Compose。
- NestJS + Fastify API，包含开发身份回退、角色权限、输入校验、事务和审计记录。
- 首页聚合、生成任务排队与查询基础接口。
- 课程目录、课程详情、选课、课时进度和“我的学习”接口。
- 管理端课程创建、课时配置、发布审核与课程上线流程。
- 管理端用户查询、日/月/并发额度调整、账户启停和作品审核接口。
- 工作流目录、版本发布、逐步执行和学习进度留痕。
- 案例社区投稿、外部资源登记、审核发布、评论、点赞与收藏。
- React 测试门户与管理后台，支持学生、教师、运营和管理员四种演示身份。
- 根目录统一启动/检查命令，以及 GitHub Actions CI。

本阶段不包含学校 SSO、真实大模型调用和对象存储文件直传。工作流与作品业务已可在不依赖模型 API 的情况下完整演示；作品暂以安全的 HTTP(S) 资源链接登记，接入对象存储后替换上传适配器。详细边界见 [`docs/framework.md`](docs/framework.md)，接口状态见 [`docs/api-contracts.md`](docs/api-contracts.md)。

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

`.env.example` 中只允许出现本地演示配置。真实数据库密码、模型密钥和学校认证凭据不得提交到 Git。`ENABLE_LOCAL_AUTH=true` 仅供本地演示；生产环境会拒绝启动该开关，必须接入学校 SSO 或受管身份提供方。

## 启动

在仓库根目录执行：

```powershell
npm run dev
```

启动后可访问：

| 服务 | 地址 |
| --- | --- |
| 测试门户与管理后台 | `http://localhost:4173` |
| API | `http://localhost:4000/api` |
| 健康检查 | `http://localhost:4000/api/health` |

前端首先显示演示身份选择页。选择管理员后可进入 `/admin`，选择教师或运营可验证对应的权限范围。

## 验证

```powershell
npm run check
```

该命令执行 API TypeScript 类型检查、前端生产构建和静态站点 Worker 测试。PR 和推送到 `main` 时，GitHub Actions 会执行相同检查。

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
