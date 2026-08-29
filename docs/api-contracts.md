# ArtEdu API 契约索引

所有业务接口以 `/api` 为前缀，使用 JSON；客户端通过 service 调用，禁止在页面组件内直接拼接请求。

| 领域 | 路径前缀 | 当前状态 | 后续负责范围 |
| --- | --- | --- | --- |
| health | `/health` | 已实现 | 存活检查 |
| auth | `/auth` | 开发身份回退 | 学校 SSO、会话刷新、登出 |
| portal | `/portal` | 首页聚合 | 首页卡片、全局搜索 |
| courses | `/courses` | 仅数据库模型 | 课程、课时、资源、进度 |
| workflows | `/workflows` | 仅数据库模型 | 工作流、版本、工具入口 |
| works | `/works` | 仅数据库模型 | 投稿、详情、评论、点赞、收藏 |
| admin | `/admin` | 用户、额度、审核 | 课程/资源/模型配置管理 |
| generation-jobs | `/generation-jobs` | 排队和查询 | 模型执行、输出文件、取消与重试 |

## 约定

- 列表接口统一返回 `{ "items": [], "page": 1, "pageSize": 20, "total": 0 }`。
- 写接口必须使用 Zod 校验输入、鉴权、事务写入和审计记录。
- 时间字段使用 ISO 8601 字符串；前端负责本地化显示。
- 领域 ID 在 API 中均为字符串；不向前端泄露数据库内部实现。
