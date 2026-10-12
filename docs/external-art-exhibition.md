# 外部艺术作品展示与来源信息

## 本轮范围

案例社区支持外部作品的单列展览详情：封面、原作者、标题与标签、中文导读、可用图片及视频，正文下方展示来源网站、展览信息及“查看原作”。

展示参考 CVPR 作品页的 836px 单列作品卡、完整比例封面、桌面 48px / 手机 24px 内容边距，字体与交互颜色保持 ArtEdu 风格。不是复制原站导航或整站抓取。

旧案例继续默认使用教学案例详情；平台创作不切换为外部展览。审核、登录与文件访问权限不变。

## 编辑与存储

选择来源“收集案例／外部创作”后，可设置“艺术展览”显示方式及下列 `story_json` 字段：

- `displayStyle`: `case-study`（默认）或 `exhibition`。
- `sourceName` / `sourceUrl`: 来源网站名称及网址。
- `originalUrl`: 官方作品详情网址，用于“查看原作”。
- `exhibitionName` / `exhibitionYear`: 展览名称及四位年份。

字段向后兼容，旧 JSON 自动补空值，无需数据库迁移。网址只作为用户主动点击的 HTTP(S) 链接，后端不抓取；拒绝脚本、文件地址、控制字符与 URL 凭据。新窗口带 `noopener noreferrer`。

外部作品仍须填写原作者、展示授权与授权说明，上传封面后单独提交审核；填写来源不等于获得授权。授权备注不对普通读者公开。

## 当前导入的作品

- Reflections on Mechanical Creativity，原作者 Pindar Van Arman。
- 来源：<https://thecvf-art.com/>，CVPR Art Gallery，2025。
- 原作：<https://thecvf-art.com/project.php?year=2025&artist=pindar-van-arman&id=1043>。
- 用户于 2026-10-12 明确确认该作品图片和视频的展示授权。
- 2026-10-12 文案复核后，视频失效和中文导读的编辑说明已移入内部备注，不在作者介绍中展示。
- 已将可用封面上传为 ArtEdu 本地文件，并按现有审核流程发布。
- 原站 `https://thecvf-art.com/wp-content/uploads/cvpr2.mp4` 在 HEAD 和 GET 检查均返回 404。本轮未伪造视频，也未热链失效地址。获得有效视频后，可在同一案例上传 MP4/WebM，无需另建案例。

这件作品目前仅在本地数据库与上传存储中；并未打包到公开 GitHub 仓库。代码提交也不会自动把数据库内容同步到其他部署。

## 验证

- `npm run check`：类型检查、API 安全、前端构建与回归检查。
- `scripts/capture-cvpr-reference.mjs`：只读原站桌面和手机截图，需 Playwright 与现有 Edge。
- `scripts/verify-exhibition-case-ui.mjs`：本地作品可见性、封面、原作者、来源、新窗口原作链接、桌面/平板/手机布局、旧案例、编辑字段及直达链接。仅创建登录会话，不写案例或点赞。
- 截图和本次导入工具存于忽略目录 `apps/api/data/qa/cvpr-art/`；不提交账号会话、授权私密备注或本地配置。

本地新增 `ENABLE_FILE_UPLOADS=true`，恢复作品文件上传；原有认证、CSRF 与文件限额保持不变。成员部署如需上传，应自行启用并配置上传存储。
