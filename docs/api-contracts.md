# ArtEdu API 契约索引

所有业务接口以 `/api` 为前缀，使用 JSON；客户端通过 service 调用，禁止在页面组件内直接拼接请求。

| 领域 | 路径前缀 | 当前状态 | 后续负责范围 |
| --- | --- | --- | --- |
| health | `/health` | 已实现 | 存活检查 |
| auth | `/auth` | 开发身份回退 | 学校 SSO、会话刷新、登出 |
| portal | `/portal` | 首页聚合 | 首页卡片、全局搜索 |
| courses | `/courses`、`/me/learning-progress` | 已实现第一阶段 | 资源上传、成果绑定查询 |
| workflows | `/workflows`、`/workflow-runs` | 已实现第一阶段 | 模型步骤执行、成果自动采集 |
| works | `/works`、`/me/works` | 已实现第一阶段 | 对象存储直传、媒体转码 |
| admin | `/admin` | 用户、额度、作品审核、课程 CMS 与发布审核 | 资源上传、模型配置管理 |
| generation-jobs | `/generation-jobs` | 排队和查询 | 模型执行、输出文件、取消与重试 |

## 约定

- 需要分页的列表接口统一返回 `{ "items": [], "page": 1, "pageSize": 20, "total": 0 }`；当前小规模目录接口至少返回 `{ "items": [] }`。
- 写接口必须使用 Zod 校验输入、鉴权、事务写入和审计记录。
- 时间字段使用 ISO 8601 字符串；前端负责本地化显示。
- 领域 ID 在 API 中均为字符串；不向前端泄露数据库内部实现。

## 课程与学习

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| GET | `/api/courses` | 查询已发布课程，支持关键词、学科、难度和精选筛选 |
| GET | `/api/courses/:courseId` | 查询课程课时、资源与当前用户进度 |
| POST | `/api/courses/:courseId/enroll` | 加入或重新加入课程 |
| PUT | `/api/courses/:courseId/lessons/:lessonId/progress` | 保存课时进度，全部完成后自动完成课程 |
| GET | `/api/me/learning-progress` | 查询当前用户已加入的课程 |

## 课程管理与发布审核

| 方法 | 路径 | 权限与用途 |
| --- | --- | --- |
| GET/POST | `/api/admin/courses` | 管理员/教师查询与创建课程 |
| PUT | `/api/admin/courses/:courseId` | 更新非审核中的课程与课时 |
| POST | `/api/admin/courses/:courseId/submit-review` | 提交发布审核 |
| GET | `/api/admin/course-reviews` | 查询课程发布审核队列 |
| POST | `/api/admin/course-reviews/:reviewId/decision` | 通过并发布，或驳回课程 |

## 工作流学习与执行

| 方法 | 路径 | 权限与用途 |
| --- | --- | --- |
| GET | `/api/workflows`、`/api/workflows/:workflowId` | 查询已发布工作流和结构化步骤 |
| POST | `/api/workflows` | 管理员/教师创建工作流草稿 |
| POST | `/api/workflows/:workflowId/versions` | 创建版本，可选择立即发布 |
| POST | `/api/workflows/:workflowId/runs` | 当前用户开始一次工作流执行 |
| PATCH | `/api/workflow-runs/:runId/progress` | 完成、跳过步骤或记录笔记 |
| GET | `/api/me/workflow-runs` | 查询当前用户的执行历史 |

工作流步骤不依赖真实模型 API。需要生成内容的步骤先保存创作说明和进度，模型适配器上线后再将该步骤委派给生成任务队列。

## 案例社区

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| GET | `/api/works`、`/api/works/:workId` | 查询已发布案例及详情 |
| GET | `/api/me/works` | 查询当前用户草稿、审核中和已发布作品 |
| POST | `/api/works` | 创建作品草稿并登记标签、工作流和资源 |
| POST | `/api/works/:workId/submit` | 提交管理员审核 |
| POST | `/api/works/:workId/comments` | 评论已发布案例 |
| POST | `/api/works/:workId/like` | 点赞或取消点赞 |
| POST | `/api/works/:workId/favorite` | 收藏或取消收藏 |

当前作品资源支持安全的 HTTP(S) 外部地址，不由服务端抓取远程文件。接入学校对象存储后，资源地址将由上传签名接口生成。
