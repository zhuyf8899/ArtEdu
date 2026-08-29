# AIGC 艺术智慧平台

一个可直接运行的全栈 MVP：学生在 Web 前台通过多模型和教学工作流完成艺术创作、提交案例；管理员在后台管理用户、限制 API 额度并审核作品。

## 工程结构

```text
codex1/
├─ apps/
│  ├─ web/                 # 用户 Web 前台（React + Vite）
│  └─ api/                 # 业务 API（Express + TypeScript）
├─ admin-console/          # 管理后台（沿用已生成的 React 管理台）
├─ database/schema.sql     # PostgreSQL 完整建表脚本
└─ docs/                   # 系统与数据库架构说明
```

## 本地运行

需要 Node.js 20 或更高版本。

```bash
npm install
npm run dev
```

- 用户前台：<http://localhost:5173>
- 管理后台：<http://localhost:4173>
- API 健康检查：<http://localhost:4000/api/health>

也可以分别运行：`npm run dev:web`、`npm run dev:admin`、`npm run dev:api`。

## 当前 MVP 能力

- 首页模型切换、Prompt 输入和生成任务提交
- API 额度的日/月/并发三层校验与实时扣减
- 资源库分类筛选、用户案例投稿与待审入队
- 学科分类、标签、教学资源文件登记与安全状态
- 学习项目和系统课程目录、课程详情、选课与逐步骤进度
- 课程步骤绑定工作流/模型，生成结果自动绑定学习成果
- 课程草稿、版本、提交审核、通过发布和驳回修改流程
- 管理后台课程 CMS、课程资源文件与发布审核队列
- 课程搜索、精选推荐和学习统计接口
- 教学工作流列表、步骤详情和从工作流发起创作
- 管理后台用户搜索、停启用、个人额度调整
- 管理后台作品审核、通过发布和驳回备注
- 响应式桌面与移动端布局

运行数据目前由 `apps/api/src/data/seed.ts` 提供，接口边界已经与 PostgreSQL 领域结构对齐。课程、审核、进度和生成成果的端到端流程可以直接演示，但服务重启后写入的演示数据会重置。生产阶段可替换为 Prisma/Drizzle 数据层，并接入 Redis 队列、对象存储、SSO 和实际模型供应商，不需要重写前端调用层。

## 课程业务接口

```text
GET/POST  /api/courses...                         课程目录、详情、选课与进度
GET       /api/subjects                           学科及已发布内容数量
GET       /api/search                             课程、资源和工作流统一搜索
GET       /api/recommendations                    精选内容推荐
CRUD      /api/admin/courses...                   课程和学习项目 CMS
POST      /api/admin/courses/:id/submit-review    提交发布审核
POST      /api/admin/content-reviews/:id/decision 审核发布或驳回
GET/POST  /api/admin/resource-files               教学文件元数据与上传任务
GET       /api/admin/analytics/courses            课程运营统计
```

## 设计与数据库

- [系统架构](docs/architecture.md)
- [数据库说明](docs/database.md)
- [PostgreSQL Schema](database/schema.sql)
