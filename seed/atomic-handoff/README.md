# MORPH LAB 原子课程交接内容包

来源为用户指定的公开交接网站，采集日期 2026-10-28：

- https://morph-lab-design-platform.wj27398.chatgpt.site/atomic-courses-particles
- https://morph-lab-design-platform.wj27398.chatgpt.site/infographic-design

包含 17 个目录条目，以及《信息图表设计》10 次课中的 13 个额外节点；去重后为 30 个教学原子。完整课程引用其中 17 个唯一原子，重复出现的辅导节点复用相同原子，保留各次课日期说明。13 个有效 SVG 封面文件位于前端 public/morph-course-network/handoff。源站的 5 个 PNG 名称实际返回完全相同的 32×32 占位图，已记录在 omittedMedia 并剔除，不当作教学附件导入。

原稿多数节点只有目录或知识大纲，没有提供完整讲义、课件或视频。因此正文明确标注为大纲阅读；完成仅是阅读与自我确认，不代表课堂学时或能力认证。原稿教授署名按来源保存在正文与来源字段；示例教师、演示用户、学习百分比均不导入。

导入使用禁用且无登录身份的“课程资料库”作来源署名，不创建可登录教师或管理员。每个新原子与原稿知识索引绑定；不写入任何学习进度、笔记、评价或能力完成证据。

```sh
npm --prefix apps/api run build
node apps/api/scripts/install-atomic-handoff.mjs --verify
# 在 API 环境中设置 DATABASE_URL 与绝对 UPLOAD_ROOT 后：
node apps/api/scripts/install-atomic-handoff.mjs --plan
node apps/api/scripts/install-atomic-handoff.mjs --dry-run
node apps/api/scripts/install-atomic-handoff.mjs --apply
```

导入整体使用数据库事务及安装记录，重复运行不产生副本；已安装校验值发生变化或 ID 冲突时停止，不覆盖管理员修改。正式执行前备份数据库和上传目录。此包不重置旧目录或现有用户记录。
