# ArtEdu 后端第一版

## 边界

- `apps/api` 是管理端、学生端和后续小程序的唯一业务入口；前端不得直接访问 PostgreSQL。
- PostgreSQL 保存关系数据、状态和审计记录；图片、视频、课件等文件仅保存对象存储键。
- 模型调用与文件处理放在独立 worker 进程，HTTP 请求只负责创建与查询任务。
- 真实身份认证以后替换 `AuthService` 的开发身份逻辑为学校 SSO；业务模块继续只依赖 `Actor`。

## 第一版已落地模块

| 模块 | 责任 | 首批接口 |
| --- | --- | --- |
| auth | 开发身份回退、读取角色 | `GET /api/auth/me` |
| admin | 用户、额度、审核和总览 | `/api/admin/*` |
| courses | 课程目录、选课、学习进度、课程 CMS 和发布审核 | `/api/courses/*`、`/api/admin/courses/*` |
| generation | 额度检查、任务创建和任务查询 | `/api/generation-jobs` |
| worker | 原子领取 queued 任务并更新任务状态 | `npm run worker` |

## 管理端状态映射

`users.status` 继续代表账户状态：`active`、`disabled`、`pending`。管理端的 `limited` 由 API 根据额度和进行中的任务计算，不写回用户表。

## 生成任务流程

```text
POST /generation-jobs
  -> 校验登录与额度
  -> 事务内锁定同一用户并写入 generation_jobs(queued)
  -> worker 使用 FOR UPDATE SKIP LOCKED 领取任务
  -> 模型适配器生成文件并写对象存储
  -> 写 generation_outputs、usage_records，任务变为 succeeded / failed
```

## 增量迁移

`0002_backend_alignment.sql` 增加 `concurrent` 额度周期，扩展审计表以记录用户额度与启停操作，并创建 `work_generation_jobs`，用于让审核列表追溯模型名称和提示词。

`0003_course_resource_business.sql` 增加课程版本与发布状态、课程审核、选课记录、工作流课时和学习生成成果关联，现有已发布课程会自动回填 slug、发布时间和总学习时长。

## 本地启动

1. 用根目录 `docker-compose.yml` 启动 PostgreSQL，并按顺序执行 `0001_initial.sql`、`0002_backend_alignment.sql`、`0003_course_resource_business.sql` 和种子数据。
2. 将 `apps/api/.env.example` 复制为 `apps/api/.env`，安装依赖后在 `apps/api` 执行 `npm run dev`。
3. 仅当 `.env` 显式设置 `ENABLE_DEVELOPMENT_AUTH=true` 时，才可使用 `DEV_ADMIN_USER_ID` 或 `x-user-id: user-admin-demo`。生产环境会拒绝启动该开关；上线前必须接入学校 SSO。
