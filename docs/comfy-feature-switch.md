# ComfyUI 节点生图总开关

后台管理 → 工作流管理 → 节点生图（ComfyUI）。仅 admin 可修改，默认开启。

关闭范围：平台/API 节点工作流和原生 ComfyUI 工作流的列表、查看、创建、编辑、版本发布、导入导出、运行与重试、临时图及其素材/结果访问、Agent 的工作流专用工具。工具同时从模型可用列表移除，执行入口拒绝旧调用。搜索和首页不再返回节点工作流。

知识图谱、课程知识绑定、课程 PDF 检索、普通直接生图和外部设计工具保留原有行为。

关闭时取消排队 GPU 任务，正在运行的 GPU 任务改为 cancelling；Worker pulse/progress 返回取消信号，finish 保留用于收尾。Worker claim 返回空，不领取新任务。已发出的模型请求不保证立即停止，临时图在下一次模型调用前检查开关。

设置保存在 comfy_feature_settings，记录修改人和时间。管理开关入口不受此开关限制。服务端逐请求检查，已打开页面每 15 秒或获得焦点时同步；修改者页面立即同步。开启不会自动重试已取消任务。

迁移：npm run db:migrate，0044_comfyui_feature_switch.sql，无需 seed。

验证：
- npm --prefix apps/api run typecheck
- npm --prefix apps/api run test:security
- apps/api 中执行 npx tsx src/scripts/verify-comfy-feature.ts，在真实本地数据库事务中检查关闭和恢复，最终回滚。
- npm --prefix admin-console run build
- apps/api 中执行 node scripts/verify-comfy-feature-ui.mjs，以模拟 API 验证桌面、手机、开关恢复和外部工具保留。需要本机 Edge 或设置 AGENT_BROWSER_EXECUTABLE；截图位于 data/qa/comfy-feature。
