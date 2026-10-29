# 腾讯云 CVPR 精选案例恢复

## 原因

服务器部署前的数据库只有 10 件其他社区案例，没有九件 CVPR 精选作品。此前更新代码和原子课程数据沿用这一数据库；拉取 Git 不会带回开发机数据库中的精选作品及上传目录内的图片、视频。仓库旧 `community-showcase` 包是另一组九件教学案例，并非 CVPR 精选案例包。

## 恢复范围

从原发布回执和文件恢复九件：Reflections on Mechanical Creativity、Atlas of Perception、Diffusion TV、Fertile Matrices、entropic.contagion、The Thousand Names of Macskusz、Glitchbox、The Future of the Past、Clinamen — Visiones Imbris。

恢复包只包含这九件作品的公开信息、30 张图片及 13 段视频。未迁移整库、账号凭据或其他用户资料。保留作品 ID 和媒体 ID，并使用此前补充的长介绍、修正后的原作链接和展览信息。原来未获取到的视频未补造。

恢复前的线上数据库原地保存在 `/home/surecat/artedu-backups/cvpr-recovery-20261029/database-before.dump`；独立媒体包保存在 `/home/surecat/artedu-content/cvpr-showcase-v1`，目录仅管理员可访问。恢复不需要重启 API 或重新构建前端。

## 后续部署

代码、数据库和上传持久卷是三项不同的部署内容。保留原持久卷；迁移到其他机器时配套搬迁数据库和上传目录。若从全新数据库启动，须在旧教学案例包之外显式安装本 CVPR 发布包。

安装器及清单位于 `apps/api/scripts/install-cvpr-showcase.mjs`、`seed/cvpr-showcase/`。安装器先验证全量文件，再进行数据库事务、冲突检查、缺失文件修复和独立安装记账；不覆盖现有课程、社区投稿或个人记录。重复执行应报告 created=0、restoredFiles=0。

单元检查涵盖越界路径、其他作者/作品文件、身份、发布状态、分类、来源及署名冲突。实际恢复结果以服务器验收记录为准，不能用 Git 提交成功代替案例和媒体验收。

## 本次执行结果

- 预检确认原数据库内这九件作品全部缺失，无同标题或原作链接冲突。
- 首次安装 created=9、restoredFiles=43；再次安装均为 0。
- 线上实际目录服务返回精选 9 件、社区 10 件；九件详情的介绍、署名和原作链接与清单一致，学生视角不返回内部备注。
- 43 个持久化文件长度及 SHA-256 全部一致；13 段视频各检查开头、中间、尾部的 128 字节读取，39 次均返回 206 且字节正确，越界请求返回 416。
- 课程 16 门、教学原子 30 个保持不变，原有互动和学习记录的事务内指纹一致；健康接口正常。
- 验收通过实际线上业务服务完成，未新建登录会话、提取浏览器凭据或更改认证规则。本轮内置浏览器连接超时，因此不将线上浏览器实际拖动播放标记为已完成。
