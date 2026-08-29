# 课程资源业务原型：实现与集成说明

> 分支定位：这是可独立运行的课程资源业务参考实现，用于产品验收、接口联调和向主工程迁移；它不会替换 `main` 已确定的生产代码架构。

## 本轮交付范围

本轮按“基础数据 → 内容管理 → 发布审核 → 用户学习 → 工作流创作 → 运营统计”的顺序完成：

1. 学科、标签、教学资源文件等基础数据。
2. 课程与学习项目目录、详情、搜索及推荐。
3. 管理端课程/项目新建、编辑、版本和提交审核。
4. 发布审核通过或驳回，只有已发布内容进入用户目录。
5. 用户选课、步骤进度与个人学习记录。
6. 课程步骤绑定工作流和模型，生成结果回写为学习成果。
7. 管理端课程、资源文件、审核队列与课程运营统计。

## 目录说明

```text
prototypes/course-resource-mvp/
├─ apps/api/              # Express + TypeScript 参考 API
├─ apps/web/              # React + Vite 用户前台
├─ admin-console/         # React + Vite 管理后台
├─ database/schema.sql    # PostgreSQL 领域表结构参考
└─ docs/                  # 架构和数据库说明
```

## 本地运行与验证

环境要求：Node.js 20+。

```bash
npm install
npm run dev
```

- 用户前台：<http://localhost:5173>
- 管理后台：<http://localhost:4173>
- API：<http://localhost:4000/api/health>

完整校验：

```bash
npm run check
```

该命令依次执行 API 类型检查和构建、前台构建和站点测试、管理后台构建和站点测试。

## 主要业务接口

| 业务 | 接口 |
| --- | --- |
| 学科与标签 | `GET /api/subjects`、`GET /api/tags` |
| 用户课程目录 | `GET /api/courses`、`GET /api/courses/:id` |
| 选课与进度 | `POST /api/courses/:id/enroll`、`POST /api/courses/:id/progress` |
| 搜索与推荐 | `GET /api/search`、`GET /api/recommendations` |
| 创作成果 | `POST /api/generations`、`GET /api/me/generation-outputs` |
| 课程 CMS | `/api/admin/courses...` |
| 发布审核 | `/api/admin/content-reviews...` |
| 教学文件 | `/api/admin/resource-files...` |
| 课程统计 | `GET /api/admin/analytics/courses` |

## 向主工程迁移的对照关系

| 原型位置 | 主工程建议落点 | 迁移说明 |
| --- | --- | --- |
| `apps/api/src/domain/types.ts` | API 的课程领域 DTO/实体 | 保留状态枚举和接口字段，改由生产框架校验器声明 |
| `apps/api/src/data/seed.ts` | 数据库 seed/fixture | 拆分为初始化数据和测试夹具 |
| `apps/api/src/services/learning.service.ts` | courses/learning application service | 保留筛选、选课、进度计算规则，替换内存数组为 Repository |
| `apps/api/src/app.ts` | courses、reviews、assets、generation 模块 | 按路由分模块并接入鉴权/RBAC |
| `database/schema.sql` | 增量 migration | 逐表转成迁移脚本，不直接覆盖主工程已有 schema |
| `apps/web/src/App.jsx` | Portal 课程资源路由 | 将页面和交互拆成主工程既有组件/数据请求层 |
| `admin-console/src/AdminDashboard.jsx` | Admin 课程资源模块 | 接入主工程路由、权限点及统一表格/表单组件 |

## 重要边界

- 当前 API 使用内存数据，服务重启后写入内容会重置。
- 文件上传保存的是教学文件元数据；生产环境需要对象存储预签名上传和病毒扫描回调。
- 模型生成使用演示任务结果；生产环境需要消息队列、回调、重试和供应商适配器。
- 鉴权使用演示用户上下文；迁移时必须接入主工程 SSO、RBAC 和审计日志。
- 数据库脚本是领域设计参考，应以增量迁移合入，避免与 `main` 的已有表结构冲突。

## 验收路径

1. 管理员创建课程或学习项目并提交审核。
2. 审核员在发布审核队列中通过内容。
3. 用户在课程资源页找到已发布内容并选课。
4. 用户完成步骤，通过绑定工作流发起模型创作。
5. 生成结果绑定课程/项目，进度和课程统计同步变化。
