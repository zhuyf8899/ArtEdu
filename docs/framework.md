# ArtEdu 第一阶段框架完成标准

本阶段只交付可并行开发的工程骨架，不交付学校 SSO、模型调用、对象存储或完整业务流程。

## 统一边界

- `admin-console` 只负责浏览器交互和调用 `/api`，不得直连数据库。
- `apps/api` 是所有客户端的业务入口；以模块划分领域逻辑和权限判断。
- PostgreSQL 只保存关系数据、状态、审计及对象存储键；文件二进制不进入数据库。
- `generation` worker 是唯一可执行长耗时任务的进程；HTTP API 只创建或读取任务。

## 开发入口

```powershell
npm run db:prepare
npm run dev
npm run check
```

`npm run check` 会依次执行 API 类型检查、安全与契约回归测试、前端生产构建及 Sites Worker 测试。

迁移由 `schema_migrations` 记录；新增迁移必须使用 `migrations/0003_描述.sql` 格式，已应用迁移禁止修改。

## 固定路由

| 页面 | 路径 |
| --- | --- |
| 首页 | `/` |
| 教学资源 | `/learning` |
| 设计工作台 | `/studio` |
| 案例社区 | `/community` |
| 管理总览 | `/admin` |
| 用户管理 | `/admin/users` |
| 作品审核 | `/admin/reviews` |

详情页、编辑页和真实权限拦截属于业务实现阶段，但新增页面必须扩展本表及前端路由表。
