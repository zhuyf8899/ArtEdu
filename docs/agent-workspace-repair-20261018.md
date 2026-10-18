# Agent 修复已合入本地业务工作区

2026-10-18，已将沙箱验证的执行、交付及展示修复接入实际业务代码。保留工作区原有修改；修改前的相关源文件副本位于 `D:/ArtEdu/local-artifacts/agent-workspace-20261018/before/`。本次未部署远程服务器，未新增付费模型调用。

本地工作区：[http://localhost:4173](http://localhost:4173)。API 在 `127.0.0.1:4000`，连接本机 Docker PostgreSQL。使用 localhost 地址以匹配已有会话来源配置。

## 已接入的行为

- 文本、网页、图片、图案、文档统一进入 Agent 编排；复合请求不会在前端被提前压成单一文档或图片任务。解释、否定和格式讨论保持只读。
- 服务端独立构建任务合同和工具权限，前端不再替换工具/交付策略。DeepSeek 工具执行默认关闭 thinking；内部探针不进入业务工具列表。
- 截断的工具参数不落盘，反馈后重新提交；最后一轮不再接受新工具。根据实际成果和最新检查补齐缺项，阻止重复生成及重复启动工作流。
- 网页修改会保留实际文件位置；CSS/JS 改动使旧检查失效。静态检查补查空样式、脚本语法、CSS 外链和禁止的联网请求。
- 使用可配置的独立 Chromium/Chrome 检查渲染、SVG 颜色、可识别画廊筛选及移动端溢出；禁止外网请求，不复用用户浏览器资料。优先 `AGENT_BROWSER_EXECUTABLE`，其次 PDF 浏览器配置和平台常用路径；未配置时明确报告只做静态检查。
- 文档工具继承真实讨论上下文；图片工具调用真实生成服务、返回私有图片。**生产图片视觉核验没有接入沙箱的人工钩子；因此图片会显示“视觉内容待核验”，保持 partial，允许打开/查看图片，不声称完全满足画面要求。**
- 工作流确认绑定当前用户的动作与完整目标 ID，接受“确认启动……”等连续中文，拒绝否定、引用、疑问及 ID 前缀误匹配。
- 运行状态实际保存 succeeded / partial / paused / needs_confirmation / failed；工具检查失败和等待确认不再被审计为成功。
- 前端保留部分成果、显示明确进度及可点击成果卡，图片内联显示并复用看图浮层；摘要使用任务总体状态。执行事件减少重复 IndexedDB 写入；图片/成果高度变化继续跟随输出，用户回看时保持位置。
- 重试只发送选中分支，压缩记忆与产物提示有独立上下文预算。暂停后读取服务端检查点，保留中断前已写入的成果。

## 本地数据库

已确认连接为 localhost:5432，仅有 `0038_agent_delivery_states.sql` 待应用；该迁移已在事务及迁移锁下执行并记入 schema_migrations。没有执行其他数据迁移或清理。

真实数据库验证在独立测试用户事务中执行，最终 ROLLBACK：五种终态持久化、五项跨用户访问拒绝、运行中成果检查点、失败工具审计，共12项。

## 验证结果

| 检查 | 结果 |
|---|---|
| 后端完整安全/Agent回归 | 157/157 |
| 前端全部测试文件 | 183/183 |
| 实际业务 Harness 的11例隔离回归 | 11/11 |
| 真实 React 工作区 Chrome 回放 | 11/11；成果卡、状态、图片、移动端布局 |
| 本地真实 PostgreSQL | 12/12；测试数据回滚 |
| HTTP健康、前端代理、匿名私有访问保护 | 4/4；200、200、401、401 |
| API TypeScript 构建、前端生产构建 | 通过 |

11例回归使用真实业务 Harness/工具和脚本模型响应，数据库与生成服务在这组回归里使用隔离夹具；React回放展示这组实际业务输出。它们不是新一轮外部模型成功率测试。真实模型验证来自此前沙箱3轮；本次没有冒用历史成功结果替代新业务测试。

“11/11通过”指满足各项验收条件：第7项预期 partial，第8项预期 paused，第11项预期图片文件存在但视觉待核验，不是所有任务都显示 succeeded。没有启动真实业务工作流，没有把沙箱复核人或固定个人电脑依赖注入业务代码。

证据目录：`D:/ArtEdu/local-artifacts/agent-workspace-20261018/`：`api-tests.log`、`frontend-all-tests.log`、`eleven-results.json`、`ui-results.json`、`db-results.json`、`http-results.json`，以及各 `ui-case*.png` 和 `ui-image-mobile.png`。

## 源码阅读

- [服务端编排](/D:/ArtEdu/apps/api/src/modules/agent/agent-harness.service.ts)
- [任务策略与交付验收](/D:/ArtEdu/apps/api/src/modules/agent/agent-policy.ts)
- [执行循环](/D:/ArtEdu/apps/api/src/modules/agent/agent-task-loop.ts)
- [平台工具](/D:/ArtEdu/apps/api/src/modules/agent/agent-tools.ts)
- [隔离浏览器检查](/D:/ArtEdu/apps/api/src/modules/agent/agent-browser-check.ts)
- [状态与检查点持久化](/D:/ArtEdu/apps/api/src/modules/agent/agent.service.ts)
- [前端工作区](/D:/ArtEdu/admin-console/src/CreationWorkspace.jsx)
- [会话上下文](/D:/ArtEdu/admin-console/src/conversationStore.js)
- [数据库迁移](/D:/ArtEdu/migrations/0038_agent_delivery_states.sql)

任务判断仍是保守规则，浏览器基础检查不能证明任意业务交互和审美要求；真实模型通过网络流式执行、跨设备会话和生产成品发布流程仍不属于此次隔离回归的证明范围。
