# CVPR 精选案例恢复清单

本目录的九件 CVPR 作品与 `seed/community-showcase` 的九件教学社区案例是两组不同内容。后者只有 53 张教学案例图片，不含这九件 CVPR 精选作品。

`manifest.json` 来自原平台已发布回执、公开展示信息及实际上传文件；保留作品编号、作者署名、来源、展览、封面和补充后的介绍。共 30 张图片、13 段 MP4，343,607,600 字节。用户已确认这些作品的展示授权。清单不包含账号、凭据、内部授权备注、原始文档或用户学习数据。

媒体不提交到公开 Git 仓库。匹配的发布包由平台维护者保存为 `manifest.json`、`media/<sha256>`。只同步 Git 代码无法替代作品数据库和上传文件迁移。

在 API 运行目录、使用正式配置并先备份数据库后执行：

```sh
node scripts/install-cvpr-showcase.mjs --verify /path/to/cvpr-bundle
node scripts/install-cvpr-showcase.mjs --plan /path/to/cvpr-bundle
node scripts/install-cvpr-showcase.mjs --apply /path/to/cvpr-bundle
```

预检不写入数据库或上传目录。安装仅补缺失记录和文件；相同发布包重复安装不重复创建作品。已有作品的介绍与管理员编辑不被覆盖；作品身份、作者、分类、素材哈希或路径有冲突时停止。不会导入账号身份、登录凭据、历史点赞、评论、收藏或学习进度。

上线验收须核对精选 9 件、社区原有内容、43 个媒体文件校验值，以及视频开始/中间/末尾范围读取。备份必须同时包含数据库和上传持久卷，不能只备份其中一项。
