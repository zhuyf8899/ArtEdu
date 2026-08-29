# 管理后台后端对接说明

本文是管理后台与 `feat/database-foundation`（或后续 API 分支）之间的接口契约。所有接口都以 `VITE_API_BASE_URL` 为前缀，默认是 `/api`。

## 通用约定

- 请求和响应使用 `application/json`。
- 成功响应返回文档所列对象；失败响应至少返回 `{ "message": "可展示的错误说明" }`。
- 生产环境必须验证管理员会话和角色，并记录额度变更、账户启停、审核决定的操作者与时间。
- 标识符在 URL 中必须安全编码；数据库团队可使用 UUID，但响应中的 `id` 必须保持字符串。

## 1. 获取用户列表

`GET /api/admin/users`

```json
{
  "items": [{
    "id": "U-1042",
    "name": "林知夏",
    "initials": "林",
    "department": "信息艺术设计",
    "identity": "学生",
    "status": "active",
    "plan": "教学基础",
    "dailyLimit": 30,
    "monthlyLimit": 600,
    "monthlyUsed": 428,
    "concurrentLimit": 2,
    "works": 12,
    "lastActive": "2 分钟前"
  }]
}
```

`status` 允许值：`active`、`limited`、`suspended`。

## 2. 修改用户 API 额度

`PUT /api/admin/users/:userId/quota`

```json
{ "dailyLimit": 30, "monthlyLimit": 600, "concurrentLimit": 2 }
```

响应返回更新后的完整用户对象。三个字段均为大于或等于 0 的整数；设置为 0 表示禁止相应的新任务。

## 3. 修改用户状态

`PATCH /api/admin/users/:userId/status`

```json
{ "status": "suspended" }
```

响应返回更新后的完整用户对象。管理界面目前发送 `active` 或 `suspended`。

## 4. 获取作品审核队列

`GET /api/admin/reviews`

```json
{
  "items": [{
    "id": "CASE-0281",
    "title": "生成式纹样：夏夜标本",
    "author": "林知夏",
    "department": "信息艺术设计",
    "kind": "工作流案例",
    "model": "Flux.1-dev",
    "submittedAt": "今天 13:26",
    "machineStatus": "机器预审通过",
    "prompt": "作品生成提示词",
    "assets": 6,
    "status": "pending"
  }]
}
```

`status` 允许值：`pending`、`approved`、`rejected`。正式接口建议同时返回 ISO 8601 时间字段，前端随后统一格式化。

## 5. 提交审核决定

`POST /api/admin/reviews/:reviewId/decision`

```json
{ "status": "approved", "note": "审核备注，可为空" }
```

响应返回更新后的完整审核对象。`status` 只能为 `approved` 或 `rejected`；后端应使用事务同时更新作品发布状态和审核日志。

## 推荐数据库映射

| 前端概念 | 推荐表/领域 |
|---|---|
| 用户基础信息与状态 | `users`、`user_profiles` |
| 日/月/并发额度 | `api_quota_policies` |
| 实际用量 | `api_usage_ledger` 或按月汇总表 |
| 投稿与资源库发布状态 | `artworks` / `resource_submissions` |
| 审核结果与备注 | `moderation_reviews` |
| 管理员操作记录 | `admin_audit_logs` |

## 合并前检查清单

1. 后端接口路径或字段变化时，只修改 `src/services/adminApi.js` 或本文件约定。
2. 增加管理员登录与 RBAC，所有写接口至少要求管理员角色。
3. 为额度变更实现并发安全更新，避免用量统计与额度检查产生竞态。
4. 为列表接口增加分页后，同步更新前端表格页码逻辑。
5. 运行 `npm ci && npm run build && npm run test:sites`。
