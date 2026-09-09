# ArtEdu 本地 Docker 启动与恢复

日常启动在仓库根目录运行 `npm run dev`。它先定位 Docker CLI、启动 Desktop 并等待引擎，再启动 PostgreSQL、验证 API 数据库账号连接、应用迁移，最后启动应用。任何依赖失败都会终止启动，避免首页打开后登录才报请求错误。

- `npm run db:up`：自动查找 Docker（含 Windows 当前用户安装目录），等待引擎和数据库健康。
- `npm run db:check`：只读检查引擎、端口配置和实际 SQL 连接。
- `npm run db:repair`：引擎不可用且错误文件明确匹配已知套接字故障时，关闭已崩溃的 Desktop，严格核对运行目录后备份，再启动并验证 PostgreSQL。其他错误拒绝自动处理；健康引擎不会被停止。
- `npm run db:down`：仅停止项目 PostgreSQL，保留容器及数据卷。
- `npm run db:prepare`：首次准备数据库，额外执行迁移和演示种子；日常启动不重复执行种子。

根目录 `.env` 的 `ARTEDU_POSTGRES_PORT` 必须与 `apps/api/.env` 的 `DATABASE_URL` 端口一致。默认端口 5432；本机使用 5433。脚本不会打印含密码的连接字符串。非标准 Docker 安装可设置 `ARTEDU_DOCKER_PATH` 为 docker.exe 完整路径。

## 2026-09-09 故障定位

Docker 后端日志报告 `sailor-ingest.sock` 和 `docker-secrets-engine/engine.sock` 无法访问，导致 Linux 引擎未启动；CLI 未加入 PATH 又造成“docker 不是可识别命令”。WSL 中 docker-desktop 发行版仍存在，数据库卷也仍存在。

本机在 Docker 完全停止后，将以下两个目录同时原位重命名为带时间的备份，再启动 Desktop，引擎恢复：

- `%LOCALAPPDATA%\Docker\run`
- `%LOCALAPPDATA%\docker-secrets-engine`

备份前逐项确认这些目录只有已知名称的 0 字节运行时套接字。正常冷启动也会在 Docker 无进程时备份此类遗留文件，若有未知内容则停止并报错。不要将这一处理扩展至 Docker 根目录、WSL 虚拟磁盘或包含实际数据的目录。自动启动脚本不会删除文件、清理卷或重置 Docker。

如再次发生套接字错误，先读 Docker Desktop 的最新日志，正常退出 Desktop 并确认进程已退出，再核对上述目录内容。不要连续强制结束、重新启动后端，这会留下新的套接字。常规重启使用 `docker desktop restart --timeout 120`。仅在故障仍存在且已确认文件范围时备份运行目录；不要执行恢复出厂、`docker system prune --volumes` 或 `wsl --unregister docker-desktop`。

启动修复与 DeepSeek 功能代码分开验证：Docker 正常不代表所有应用功能已部署。检查平台仍需数据库迁移、API 健康检查、账号登录与实际请求。

## 验证结果与限制

2026-09-09 本机完成 `db:repair` 恢复、`db:up` 幂等启动、SQL 账号连接、迁移、`npm run dev` 全套启动、首页同源登录和真实 DeepSeek 请求；浏览器首页已显示模型回复。API 测试 24 项、前端测试 6 项及构建通过。

Docker 自动更新到 4.90.0 后，官方 `docker desktop restart` 仍复现套接字错误，因此此变更是可验证的恢复与启动保障，不能声称修复了 Docker/Windows 底层缺陷或保证永不复发。相同故障见 [Docker 官方问题区 #531](https://github.com/docker/desktop-feedback/issues/531)。正常 Windows 临时套接字测试关闭后文件自动消失，不能据此将问题归咎于整个 Windows 系统。

修复脚本只有在引擎不可用、错误记录属于当前后端进程、错误内容匹配已知故障且 Docker 错误窗口存在时，才允许停止失败的后端。备份目录保留供人工核对；不自动删除。无需重装或恢复出厂设置。
