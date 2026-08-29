# AI Design Platform API

美院 AI 教学、设计工具与案例社区平台的后端服务。

## 当前技术栈

- NestJS 12 + TypeScript
- PostgreSQL 18
- Prisma ORM 7
- MinIO（本地 S3 兼容对象存储）
- Docker Compose

## 本地环境要求

- Node.js 24 或更高版本
- npm
- Docker Desktop（使用 WSL 2 后端）

## 第一次启动

```powershell
npm ci
Copy-Item .env.example .env
npm run infra:up
npm run db:generate
npm run db:migrate -- --name init
npm run start:dev
```

启动后可以访问：

- API：http://localhost:3000
- 应用健康检查：http://localhost:3000/health
- 数据库健康检查：http://localhost:3000/health/database
- MinIO API：http://localhost:9000
- MinIO 管理界面：http://localhost:9001

本地账号、密码和数据库连接字符串保存在 `.env` 中。`.env` 不应提交到 Git。

## 安全默认值

- PostgreSQL、MinIO API 和 MinIO 管理界面只绑定到 `127.0.0.1`，仅供本机开发使用；生产部署应将它们放在内网，不能直接发布到公网。
- API 默认绑定 `127.0.0.1`，如在容器或受管服务器运行，需显式设置 `APP_HOST=0.0.0.0`，并由网关提供 HTTPS。
- 默认不允许跨域请求。只有浏览器前端位于不同来源时，才在 `.env` 中设置精确允许名单，例如 `CORS_ORIGINS=https://app.example.edu.cn`。
- `TRUST_PROXY` 默认关闭；只有反向代理运行在同一台机器上时才设置为 `loopback`。不要设置为 `true`。
- 请求限流默认是每个 IP 每分钟 120 次。本地实现仅适用于单实例开发；正式多实例部署应在网关或 Redis 中实现共享限流。

## 日常开发命令

```powershell
# 启动 PostgreSQL、MinIO，并自动创建本地 bucket
npm run infra:up

# 查看容器状态
npm run infra:status

# 启动后端开发服务器
npm run start:dev

# 运行测试和编译
npm test
npm run build

# 查看 Prisma 迁移状态
npm run db:status

# 打开 Prisma 数据管理界面
npm run db:studio

# 停止容器但保留数据
npm run infra:down
```

不要随意运行 `docker compose down -v`。其中的 `-v` 会删除本地 PostgreSQL 和 MinIO 数据卷。

## 修改数据库结构

1. 修改 `prisma/schema.prisma`。
2. 格式化并校验模型：

   ```powershell
   npx prisma format
   npx prisma validate
   ```

3. 创建并应用迁移：

   ```powershell
   npm run db:migrate -- --name describe_your_change
   ```

4. 运行测试与编译：

   ```powershell
   npm test
   npm run build
   ```

## 当前数据库内容

第一版迁移已经创建：

- `users`：用户基础信息、学校身份、角色、认证来源和账号状态
- `_prisma_migrations`：Prisma 自动维护的迁移历史

后续将在需求确认后逐步增加课程、资源、作品、工作流、评论、审核和 API 调用记录等业务表。
