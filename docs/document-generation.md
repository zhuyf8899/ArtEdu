# 文档生成业务：第一阶段

本阶段提供真实 Word（.docx）、PPT（.pptx）、PDF 下载，不把模型输出的一段文字或虚构链接当作文档。

## 使用

1. 登录平台，在首页的创作能力菜单选择 Word 文档、PPT 演示或 PDF 文档。
2. 选择具有 `document` 能力的已配置模型，输入课程主题、受众和要求。
3. PPT 可选择 2–12 页（包含封面）；不选择时由描述决定。
4. 提交后进入独立创作页，完成后阅读正文，并通过回复下方链接下载文件。下载仍需要有效登录会话；近期历史消息保留文件入口。

## 管理员配置

- 执行数据库迁移，确保模型配置具备 document 能力。
- 私有 `apps/api/.env` 中的 MODEL_PROVIDERS_JSON 同样需要包含 document；密钥只放在其 apiKeyEnv 指定的私有环境变量。
- PDF 使用 puppeteer-core，不自动下载浏览器。管理员应在 API 主机安装独立 Chrome/Chromium 与中文字体，并设置 PDF_BROWSER_EXECUTABLE 为可执行文件绝对路径。
- 使用独立临时浏览器配置，关闭网页脚本，阻断网络请求，保留浏览器沙箱。不应通过 --no-sandbox 解决部署问题。
- 当前 Dockerfile 不包含 PDF 浏览器和字体；容器 PDF 部署尚待专门验收。不能把本机浏览器路径直接复制进容器配置。
- 原有 DeepSeek 密钥不进入 Git；从对话等不受控位置暴露过的密钥建议轮换。

## 数据与接口

继续使用 `POST /api/generation-jobs/run`，传入 jobType=document 和 parameters.outputFormat=docx|pptx|pdf；PPT 可传 parameters.pageCount。

模型统一返回 schemaVersion、title、summary、sections，sections 含 heading、paragraphs、bullets。服务端严格校验 JSON、段落长度、章节数及指定 PPT 页数，再按受控模板渲染。Word/PPT/PDF 复用同一正文结构，但不是同一请求同时导出三种文件。

文件仍使用现有 generation_outputs 表及私有 UPLOAD_ROOT；返回真实 MIME、大小与下载地址。文件名包含标题，存储文件名使用随机 UUID。数据库保存失败会清理刚生成的文件。

当前沿用任务权限：作者可下载本人文件，teacher/admin 可读取其他用户任务；operator 不具有该权限。后续如需教师仅能查看授课学生，应单独收紧原有权限模型。

## 测试

`npm run check` 执行 API 类型检查、安全及业务单测、前端构建和现有前端测试。设置有效 PDF_BROWSER_EXECUTABLE 后，导出单测也会启动沙箱浏览器验证 PDF。

GitHub CI 显式使用运行器的 `/usr/bin/google-chrome` 并安装 `fonts-noto-cjk`，避免将 Ubuntu 的 Chromium Snap 启动器当成可用渲染服务。CI 保留浏览器沙箱并实际生成 PDF；浏览器启动失败会阻止合并，而不是跳过测试。

在仅包含测试账号的本机环境，设置 ARTEDU_LIVE_DOCUMENT_TEST=true 后运行 `npm run test:documents:live`。该脚本会调用真实模型，消耗用量，并留下测试任务及私有文件。它验证四账号的 Word/PPT/PDF 生成、文件格式、匿名拒绝及 operator 跨用户拒绝；不会输出密钥或登录 cookie。

2026-09-11：四账号真实测试通过；PDF 中文 A4 样本及 PPT 三页预览已检查。Word 已验证 DOCX 内部结构与正文，但缺少捆绑的 LibreOffice，尚未完成 Word 原生分页视觉验收。PPT 预览采用导入渲染，仍建议在目标 PowerPoint/WPS 版本复核。

## 明确边界与后续顺序

2026-09-12 续作：恢复本机 Docker/PostgreSQL 与应用服务；31 项后端测试、前端构建与回归测试通过；四账号真实生成与下载鉴权复测通过。浏览器学生账号成功生成指定三页 PPT。补充模型能力提示、PPT 页数草稿恢复、请求异常恢复和底部选项换行布局。

1. 当前是同步生成、文本型模板；PDF 单进程仅允许一份同时渲染，繁忙时明确报错。未实现后台文档队列、取消任务、断点恢复、版本管理或同内容多格式导出。
2. 结构不合格会明确失败，不会静默删掉内容。渲染失败仍记录模型已返回的 token 消耗；平台请求额度继续沿用原有成功/进行中任务计数政策。
3. 集成已保留 main 的 ModelScope 图片通道；图片任务可省略模型 ID 由后台路由，文档仍要求选择明确的模型。图片真实调用取决于部署环境的私有凭据，本轮未替换或上传图片密钥。
4. 随后增加后台任务、文件版本/过期清理/存储额度、图片嵌入模板和完整部署回归。

## 与协作者 main 的集成

基于 15f7547 集成，不回退独立创作页、IndexedDB 历史、HTTP UUID 兼容或图片产物展示。PDF 能力与 PPT 页数贯通首页 pending 请求及创作页续写请求；修正创作页提交表单绑定，下载路由继续对图片使用 inline、对文档使用 attachment，并正确识别 PDF 扩展名。内部图片模型的实际 ID 被写入任务与用量记录。

原先在 9d3a0a6 上通过的真实账号验证不等同于集成后全部部署验收；集成版另外执行类型、构建、安全及兼容性回归。Docker 内 PDF 浏览器部署、Word 原生分页和真实图片服务仍保留上述验收边界。

2026-09-12 集成复验：在独立数据库 artedu_document_merge_verify 与隔离端口 4273/4100 完成四账号真实生成和鉴权下载测试，使用已配置的 DeepSeek 文本服务；原平台数据库未迁移。集成版 npm run check 通过，新增覆盖内部图片路由及创作页提交绑定。此验证不表示生产站点已重新部署。
