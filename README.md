# ArtEdu

清华美院 AI 艺术教育平台。

## 数据库基础层

当前数据库采用 PostgreSQL 作为正式环境的结构化数据存储。数据库设计和迁移文件已经放在：

- `db/schema.ts`：数据表用途说明
- `migrations/0001_initial.sql`：第一版建表和索引
- `seed/seed.sql`：本地开发使用的演示数据

第一版覆盖用户与学校身份、角色与院系、课程/课时/资源/学习进度、教学对话、工作流和工具、模型配置与调用额度、作品社区（标签、评论、点赞、收藏）、书籍推荐、生成任务、文件元数据和审核记录。

图片、视频、PDF、Word、PPT 等真实文件后续放入学校提供的 S3 兼容对象存储；数据库只保存文件名称、类型、地址和关联关系。

当前还没有接入真实登录和线上数据库资源。后续会先补最小后端 API，再把前端页面从写死的演示数据逐步切换到数据库数据。

## 本地 PostgreSQL 验证

已提供 `docker-compose.yml`，供开发环境启动 PostgreSQL 16。安装 Docker Desktop 后，在项目根目录运行：

```powershell
docker compose up -d
docker compose exec postgres psql -U artedu -d artedu -c "SELECT COUNT(*) FROM users;"
```

容器第一次启动时会依次执行 `migrations/0001_initial.sql` 与 `seed/seed.sql`。`.env.example` 只包含本地演示连接串；真实密码应由部署环境的密钥管理服务提供，不能提交到 Git。
