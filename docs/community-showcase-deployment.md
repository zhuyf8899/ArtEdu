# 九个案例的可重复部署

原先九个案例只存在于某台机器的数据库和 `UPLOAD_ROOT`，代码更新或单独恢复数据库都不会带回图片。本仓库现在包含一份**公开展示专用**的受控包：`seed/community-showcase/manifest.json` 与 `media/` 中 53 张图片（约 96 MB）。这是用户确认已获社区展示授权的九个已发布案例；**不包含**原始 Word、视频、登录凭据和私有授权备注。

## 新成员本地部署

```powershell
npm ci
npm --prefix apps/api ci
npm --prefix apps/api run showcase:verify
npm run db:prepare
npm run dev
```

`db:prepare` 会迁移数据库、初始化演示账号，再安装九个案例。若数据库已初始化，只需在 API 的 `.env` 配好 `DATABASE_URL` 和 `UPLOAD_ROOT`，运行 `npm --prefix apps/api run showcase:install`。打开案例社区并用有效账号登录即可查看。

安装器先验证所有 53 张图片的大小与 SHA-256，再补齐缺失的磁盘文件和数据库记录。重跑不会重复创建案例，不覆盖已有作品内容或不一致的上传文件；发现同名不同 ID、哈希不一致等冲突会报错并停止。数据库与上传目录必须配套备份/迁移，不能只复制数据库。

## Docker staging

`deploy/deploy-staging.sh` 在迁移后自动执行 `showcase:install`；API 镜像包含展示包，图片落到持久化的 `artedu_staging_uploads` 卷，而不是容器临时层。首次部署无需另外拷贝案例素材。已存在的九个案例只会核对记录并补齐缺失图片。部署前脚本仍会备份数据库与上传文件。

该展示包不是案例投稿入口，也不自动发布未来新增的用户作品。将来新增案例仍须走作者授权、上传、审核流程；不得把 `apps/api/data/`、原始资料包或私有授权证明直接提交到 GitHub。
