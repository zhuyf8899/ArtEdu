# ArtEdu

清华美院 AI 艺术教育平台。第一阶段工程框架已完成，当前仓库可以在本地同时运行 PostgreSQL、NestJS API、生成任务 Worker 和 React 测试门户/管理后台。

## 当前已实现

- PostgreSQL 数据模型、版本化迁移、演示种子数据和 Docker Compose。
- NestJS + Fastify API，包含开发身份回退、角色权限、输入校验、事务和审计记录。
- 首页聚合、生成任务排队与查询基础接口。
- 管理端用户查询、日/月/并发额度调整、账户启停和作品审核接口。
- React 测试门户与管理后台，支持学生、教师、运营和管理员四种演示身份。
- 根目录统一启动/检查命令，以及 GitHub Actions CI。

本阶段不包含学校 SSO、真实大模型调用、对象存储或完整课程/工作流/作品业务。详细边界见 [`docs/framework.md`](docs/framework.md)，接口状态见 [`docs/api-contracts.md`](docs/api-contracts.md)。

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

`.env.example` 中只允许出现本地演示配置。真实数据库密码、模型密钥和学校认证凭据不得提交到 Git。

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

## 课程资源业务参考实现

`feat/course-resource-business` 分支增加了一个不侵入主框架的可运行参考实现，位于 [`prototypes/course-resource-mvp`](prototypes/course-resource-mvp)。它覆盖课程/学习项目 CMS、发布审核、用户选课与进度、工作流创作成果绑定和课程统计。

该目录用于业务验收和迁移对照，不代表主工程的最终技术实现。迁移边界、接口清单和模块映射请先阅读 [`docs/course-resource-business-integration.md`](docs/course-resource-business-integration.md)。
