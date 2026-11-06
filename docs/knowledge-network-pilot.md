# 30 节点知识网络样例

入口：我的空间 → 知识网络（/my-learning?view=knowledge）；或完整课程/学习原子目录 → 展开课程网络 → 知识节点网络。课程网络默认收起，原有插画与课程总览保留在“课程参考总览”中。

本地样例选择 30 个现有且有课程资源关联的已发布知识节点，分为设计思考、用户研究、信息组织、视觉表达、交互验证五组。12 个节点有标签，18 个保留待标注状态。手工配置 51 对相关连接，与既有连接合并去重后当前为 54 条；所有节点连通，包含组内环路和跨组连接。

固定坐标、选点和人工连接清单位于 shared/knowledgeNetworkPilot.mjs，尚未实现自动布局或 AI 课程编排。连接表达知识相关性，不表示已确认的教学先修要求。标签标识使用 #，不表示完成或掌握。

数据来自 GET /api/me/knowledge-network。只返回 published 且 show_in_network=true 的节点、两端均在网络中的边、可访问的资源绑定；继承登录验证。相关边按无向关系去重，前置边保留方向。

knowledge_nodes 新增 tags（最多 12 个，每个最多 40 字）和 show_in_network。后台管理 → 知识图谱，可编辑标签与“展示于知识节点网络”。课程标签同步不覆盖这些字段。标签不改变课程正文、进度、评价或已有资源绑定。

部署：npm run db:migrate 后，在 apps/api 中执行 npm run knowledge:install-network。脚本只选择唯一匹配且已发布的现有节点，保留已有连线与课程关联；缺少课程知识点时明确失败，不创建虚构课程。可重复执行，不重复增加边。

验证：npm run knowledge:verify-network 会在事务中检查标签、展示范围、课程标签同步后的保留情况，最终回滚测试写入。生成的只读快照用于 node scripts/verify-knowledge-network-ui.mjs 的隔离浏览器验收。截图与快照在 apps/api/data/qa/knowledge-network，浏览器测试不改真实数据。

后续可在此样例上讨论标签覆盖率、边的语义与权重、先修约束、目标匹配和路径评价，再决定算法。
