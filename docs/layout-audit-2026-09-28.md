# ArtEdu 页面排版巡检（2026-09-28）

巡检环境：本地 `localhost:4173`，已登录测试教师账号；主要以 772 × 772 视口检查，并在 1265 × 712 复核工作流画布。每项均有实际页面截图；这不是所有设备、浏览器或辅助技术的完整验收。

| 步骤 / 页面 | 结果 | 截图 |
| --- | --- | --- |
| 1. 首页 AI 对话与能力切换 | **已修复**。原先“学习问答”首项被固定导航裁掉；现在菜单按可用空间向上/向下展开，过高时可在菜单内滚动。 | [修复前](../design-qa-assets/layout-audit/01-home-picker-before.png) · [修复后](../design-qa-assets/layout-audit/02-home-picker-after.png) |
| 2. 独立创作对话 | **已修复**。能力菜单可完整显示；中等宽度时，带历史侧栏的三列建议被挤成窄竖排，现改为单列。 | [菜单](../design-qa-assets/layout-audit/03-create-picker.png) · [建议](../design-qa-assets/layout-audit/04-create-suggestions-after.png) |
| 3. AI 讲堂及课程详情 | 未见类似遮挡、竖排或水平溢出。 | [讲堂](../design-qa-assets/layout-audit/05-learning.png) · [详情](../design-qa-assets/layout-audit/06-course-detail.png) |
| 4. 设计工具与工作流运行页 | **已修复**。运行画布原本相对定位在长页面底部，打开后可能只看到空背景；现在固定覆盖视口。设计工具列表正常。 | [工具](../design-qa-assets/layout-audit/07-studio.png) · [窄屏画布](../design-qa-assets/layout-audit/12-workflow-runner-after.png) · [宽屏画布](../design-qa-assets/layout-audit/13-workflow-runner-wide.png) |
| 5. 案例社区及案例详情 | 未见同类截断，卡片保持两列。个别案例为“封面待补充”，属于素材完整性问题，不是排版故障。 | [社区](../design-qa-assets/layout-audit/08-community.png) · [详情](../design-qa-assets/layout-audit/11-case-detail.png) |
| 6. 我的学习 | 未见类似遮挡或竖排。 | [截图](../design-qa-assets/layout-audit/09-my-learning.png) |
| 7. 全站搜索 | 结果可用；标签在窄屏下较密集、文字偏小，建议另行做响应式简化。 | [截图](../design-qa-assets/layout-audit/10-search.png) |
| 8. 管理总览、课程、工作流、审核、本地 Bridge | 在本次视口下未见同类截断。 | [总览](../design-qa-assets/layout-audit/14-admin-overview.png) · [课程](../design-qa-assets/layout-audit/16-admin-courses.png) · [工作流](../design-qa-assets/layout-audit/17-admin-workflows.png) · [审核](../design-qa-assets/layout-audit/18-admin-reviews.png) · [Bridge](../design-qa-assets/layout-audit/19-admin-bridges.png) |
| 9. 举报处理 | **已修复路由**。原入口点击后回到总览，现可进入独立页面；未见类似排版问题。 | [截图](../design-qa-assets/layout-audit/20-admin-reports.png) |
| 10. 用户管理 | **待处理，优先级高**。772px 宽度下筛选按钮压成单字竖排，身份筛选向卡片外溢，表格需横向滚动才能看到右侧操作。 | [截图](../design-qa-assets/layout-audit/15-admin-users.png) |

## 尚待处理的相似问题

1. **管理后台／用户管理（高）**：筛选栏与表格缺少窄屏布局。建议筛选项改为可换行的两列/单列布局，表格提供明确的横向滚动提示，或在窄屏改成用户卡片。
2. **工作流画布（中）**：窄屏节点标签较小，操作面板需要内部滚动；宽屏下最右节点可被右侧面板遮住。建议给画布加“适配可见区域”按钮，并以可用画布区域（扣除面板）计算初始缩放与居中。
3. **全站搜索（低）**：筛选标签密集，窄屏阅读与点按目标偏小。建议折叠次要筛选、增大点击热区。

以上为本次**视觉巡检**结果。未使用屏幕阅读器或真实移动设备，也未覆盖全部动态数据状态，因此不能据此宣称全站无障碍或所有分辨率均无问题。
