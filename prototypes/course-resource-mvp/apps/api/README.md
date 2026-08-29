# AIGC Art API

当前服务以模块化单体方式实现第一版业务闭环。`data/seed.ts` 是可替换的演示仓储；生产环境使用 `database/schema.sql` 对应的 PostgreSQL 仓储。

## API 分组

- 公共：`/api/health`、`/api/models`、`/api/resources`、`/api/workflows`
- 创作：`POST /api/generations`、`GET /api/generations/:id`
- 用户：`GET /api/me/quota`、`POST /api/resources/submissions`
- 管理：`/api/admin/users/*`、`/api/admin/reviews/*`

额度扣减由 `services/quota.service.ts` 统一执行，依次验证账户状态、并发数、日额度和月额度。
