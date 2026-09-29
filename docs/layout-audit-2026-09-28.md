# ArtEdu 页面排版巡检（2026-09-28）

巡检环境：本地 `localhost:4173`，已登录测试教师账号；主要以 772 × 772 视口检查，并在 1265 × 712 复核工作流画布。每项均有实际页面截图；这不是所有设备、浏览器或辅助技术的完整验收。

| 步骤 / 页面 | 结果 | 截图 |
| --- | --- | --- |
| 1. 首页 AI 对话与能力切换 | **已修复**。原先“学习问答”首项被固定导航裁掉；现在菜单按可用空间向上/向下展开，过高时可在菜单内滚动。 | [修复前](../design-qa-assets/layout-audit/01-home-picker-before.png) · [修复后](../design-qa-assets/layout-audit/02-home-picker-after.png) |
| 2. 独立创作对话 | **已修复**。能力菜单可完整显示；中等宽度时，带历史侧栏的三列建议被挤成窄竖排，现改为单列。 | [菜单](../design-qa-assets/layout-audit/03-create-picker.png) · [建议](../design-qa-assets/layout-audit/04-create-suggestions-after.png) |
| 3. AI 讲堂及课程详情 | 未见类似遮挡、竖排或水平溢出。 | [讲堂](../design-qa-assets/layout-audit/05-learning.png) · [详情](../design-qa-assets/layout-audit/06-course-detail.png) |
| 4. 设计工具与工作流运行页 | **已修复**。运行画布原本相对定位在长页面底部，打开后可能只看到空背景；现在固定覆盖视口。设计工具列表正常。 | [工具](../design-qa-assets/layout-audit/07-studio.png) · [窄屏画布](../design-qa-assets/layout-audit/12-workflow-runner-after.png) · [宽屏画布](../design-qa-assets/layout-audit/13-workflow-runner-wide.png) |
| 4a. 独立图片生成画布 | 在 1265px 宽度下，节点栏、画布与参数栏均完整显示；未见同类截断。 | [截图](../design-qa-assets/layout-audit/21-image-canvas.png) |
| 5. 案例社区及案例详情 | 未见同类截断，卡片保持两列。个别案例为“封面待补充”，属于素材完整性问题，不是排版故障。 | [社区](../design-qa-assets/layout-audit/08-community.png) · [详情](../design-qa-assets/layout-audit/11-case-detail.png) |
| 6. 我的学习 | 未见类似遮挡或竖排。 | [截图](../design-qa-assets/layout-audit/09-my-learning.png) |
| 7. 全站搜索 | 结果可用；初次巡检发现标签在窄屏下密集、文字偏小，已于 2026-09-29 后续修复。 | [原截图](../design-qa-assets/layout-audit/10-search.png) |
| 8. 管理总览、课程、工作流、审核、本地 Bridge | 在本次视口下未见同类截断。 | [总览](../design-qa-assets/layout-audit/14-admin-overview.png) · [课程](../design-qa-assets/layout-audit/16-admin-courses.png) · [工作流](../design-qa-assets/layout-audit/17-admin-workflows.png) · [审核](../design-qa-assets/layout-audit/18-admin-reviews.png) · [Bridge](../design-qa-assets/layout-audit/19-admin-bridges.png) |
| 9. 举报处理 | **已修复路由**。原入口点击后回到总览，现可进入独立页面；未见类似排版问题。 | [截图](../design-qa-assets/layout-audit/20-admin-reports.png) |
| 10. 用户管理 | **已于 2026-09-29 修复**。原先 772px 宽度下筛选按钮被压成单字竖排，筛选框外溢，表格需横向滚动；现使用响应式筛选栏与用户卡片。 | [原截图](../design-qa-assets/layout-audit/15-admin-users.png) |

## 2026-09-29 后续修复

1. **用户管理**：窄内容区采用卡片展示，保留筛选、全选、额度和停用操作；在 390px 浏览器视口确认无水平溢出。
2. **工作流画布**：画布与侧栏分区，提供“聚焦当前节点”和“查看全图”；允许缩小到容纳完整节点链，改变视口尺寸时重新聚焦。在桌面视口确认六节点均留在画布内，在 390px 视口确认当前节点完整可见且操作栏无遮挡。
3. **全站搜索**：首屏展示六个标签，其余可展开；增大点按区域。窄屏搜索摘要改为三列，390px 视口无横向滚动。

已执行 `npm run check:web`，前端构建、站点测试、对话测试与平台测试均通过。浏览器视觉检查基于本地测试教师会话；未覆盖真实手机、所有浏览器和屏幕阅读器。

以上为本次**视觉巡检及后续修复**结果。登录页未在已登录会话内复测，也未覆盖全部动态数据状态，因此不能据此宣称全站无障碍或所有分辨率均无问题。
