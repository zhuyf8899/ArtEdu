# main 更新检查（2026-10-17）

## 后续合并结果

已在 `deploy/server-main-safe` 创建合并提交 `b8a492b`，下文为合并前检查记录。五处冲突均已处理，保留 main 的 MORPH 主界面、当前分支的服务端状态接口、图谱浏览状态和双方测试；API 镜像同时包含图谱导入源码与新目录素材。

合并版 332 项测试通过；恢复原有 ComfyUI 和案例导入改动并处理两处交叉冲突后，完整工作区类型检查、前端构建及 345 项测试全部通过。未执行数据库迁移、内容安装或服务器部署。

## 检出和验证

- 被检查版本：`origin/main`，`686c43d`。
- 当前工作分支：`deploy/server-main-safe`，`7eefcac`；原有未提交改动保持原样。
- 独立检出：`C:/Users/24783/.codex/worktrees/review-main-20261017/ArtEdu`（detached HEAD）。
- 两个分支的 npm 依赖锁文件一致；独立目录复用现有依赖运行 `npm run check`，退出码 0。
- API 类型检查、前端生产构建通过；测试 324 项通过：API 137、Sites 6、对话 37、平台 119、导入 19、可靠性 6。
- 日志：`local-artifacts/main-review-20261017-check.log`。本轮未启动新服务、执行数据库迁移或内容安装，也未修改服务器。

## 主要新增内容

1. React 主入口接入 MORPH 外壳、首页、目录卡片、Canvas 动效、分类/方法/作者/工具筛选；素材位于 `/morph-v17/assets/`。这与当前部署分支独立的 `/morph/` 页面是两套入口。
2. 我的空间增加专业画像、课程、计划、笔记、作品和收藏页签。MORPH 模式下旧 atlas 链接转向专业画像，经典模式保留图谱实现。
3. 课程目录新增 13 门课程，其中 3 门有新编且待教研审核的试学内容（共 9 个课时），另外 10 门筹备中，后端拒绝选课；新增 19 个第三方工具导航。
4. 课程体系提供目录规则推荐，路径保存到现有学习笔记，尚未接模型编排。
5. 工具推荐表单按账号保存到当前浏览器 localStorage，未接服务器草稿或公共审核队列；资料编辑、头像/封面保存仍待接入。
6. 案例社区细分社区与艺术精选，后台可调整模块归属；增加审核工作区、编辑备注和公开正文校验；调整媒体查看及卡片展示。

## 合并风险与功能差异

### 1. 两分支不能直接快进合并

当前分支独有 4 个提交、main 独有 16 个提交。`git merge-tree --write-tree HEAD origin/main` 检测到以下 5 个文件冲突（未执行实际合并）：

- `admin-console/package.json`
- `package.json`
- `admin-console/src/KnowledgeMap.jsx`
- `admin-console/src/MyLearning.jsx`
- `deploy/Dockerfile.api`

需要同时保留双方检查命令，明确用户端图谱与专业画像入口，并在 API 镜像中同时包含课程图谱导入所需源码和新目录素材。构建通过只证明 main 独立版本可用，不代表试合并版本可用。

### 2. 新部署流程会改变现有内容目录

`deploy/deploy-staging.sh` 新增自动运行 `catalog:install`，`scripts/start-local.ps1` 和 `db:prepare` 也接入同一安装器。安装器 `apps/api/scripts/install-morph-catalog.mjs` 第 76、77 行会将 manifest 指定的旧课程和工具归档，然后导入新目录。

指定旧课程：`course-ai-design-foundation`、`course-traditional-pattern`、`course-vibe-gallery`；指定旧工具：Figma、Canva、Photopea、Behance、Unsplash 对应的五个目录 ID。归档不删除个人学习历史，但会改变可浏览和可选课目录。

安装器有事务、备份、版本校验和重复执行保护；这仍然属于内容发布，不能将其当作纯 UI 升级。在当前“数据库不用特别改”的范围下，应先拆开内容安装步骤再整合发布。

### 3. main 尚未包含当前部署版的服务端状态能力

main 本身没有 `/morph/` 接入页面、MorphModule、`0037_morph_workspace_state.sql` 或其六项检查。其工具推荐草稿目前仅在浏览器保存，个人资料编辑尚未接入；当前部署分支已经提供按账号的服务端草稿与资料保存。直接替换成 main 不能视为这些功能的完整承接。

两边新增迁移均以前缀 `0037` 开头，但文件名不同、表结构不同。迁移器按完整文件名记录主键，因此没有编号导致的直接覆盖；合并后必须同时保留，不能只选一个。

## 建议顺序

以 main 的 React 集成作为后续主界面，保留并接入当前部署分支的服务端状态能力；处理五个冲突和原工作区 ComfyUI/案例导入改动的交叉部分；将内容目录安装与 UI 发布解耦；之后再做合并版完整检查与浏览器/数据库验收。

本轮结论：远端代码已在本地独立检出，main 独立检查通过；尚未整合进当前工作分支，尚未重新部署服务器。
