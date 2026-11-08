# 30 节点知识网络样例

入口：我的空间 → 知识网络（/my-learning?view=knowledge）；或完整课程/学习原子目录 → 展开课程网络 → 知识节点网络。课程网络默认收起，原有插画与课程总览保留在“课程参考总览”中。

本地样例选择 30 个现有且有课程资源关联的已发布知识节点，分为设计思考、用户研究、信息组织、视觉表达、交互验证五组。12 个节点有标签，18 个保留待标注状态。手工配置 51 对相关连接，与既有连接合并去重后当前为 54 条；所有节点连通，包含组内环路和跨组连接。

固定坐标、选点和人工连接清单位于 shared/knowledgeNetworkPilot.mjs，尚未实现自动布局或 AI 课程编排。连接表达知识相关性，不表示已确认的教学先修要求。标签标识使用 #，不表示完成或掌握。

数据来自 GET /api/me/knowledge-network。只返回 published 且 show_in_network=true 的节点、两端均在网络中的边、可访问的资源绑定；继承登录验证。相关边按无向关系去重，前置边保留方向。

knowledge_nodes 新增 tags（最多 12 个，每个最多 40 字）和 show_in_network。后台管理 → 知识图谱，可编辑标签与“展示于知识节点网络”。课程标签同步不覆盖这些字段。标签不改变课程正文、进度、评价或已有资源绑定。

部署：npm run db:migrate 后，在 apps/api 中执行 npm run knowledge:install-network。脚本只选择唯一匹配且已发布的现有节点，保留已有连线与课程关联；缺少课程知识点时明确失败，不创建虚构课程。可重复执行，不重复增加边。

验证：npm run knowledge:verify-network 会在事务中检查标签、展示范围、课程标签同步后的保留情况，最终回滚测试写入。生成的只读快照用于 node scripts/verify-knowledge-network-ui.mjs 的隔离浏览器验收。截图与快照在 apps/api/data/qa/knowledge-network，浏览器测试不改真实数据。

后续可在此样例上讨论标签覆盖率、边的语义与权重、先修约束、目标匹配和路径评价，再决定算法。

## Agent 只读图谱工具

get_knowledge_graph 已接入 Agent 模型可用工具及执行入口。空参数读取当前开放网络（默认最多 40 节点，覆盖当前 30 节点样例），返回真实节点 ID、名称、说明、标签、个人记录进度、连线和关联课程课时链接。

支持 scope=network/published、query 名称/说明/标签搜索、nodeId 定位、depth=0..2 邻居扩展、limit=1..60。无向相关边去重；先修方向保留。返回节点总数、匹配数和 truncated，避免将截断结果解释为完整图。无命中返回空图，未开放节点在默认范围不可读取，草稿/归档节点始终沿用已发布数据过滤。工具不写图谱、不保存学习路径，不调用生图。

ComfyUI 关闭不影响知识图谱读取，但工具返回中不提供被关闭的工作流资源入口。课程/课时查询可继续使用 get_course_lesson，PDF 内容仍由 search_course_knowledge 查询。

验收：apps/api 中运行 npx tsx --test src/modules/agent/knowledge-graph-tool.test.ts；npx tsx src/scripts/verify-agent-knowledge-graph.ts 在只读数据库事务中验证真实工具分发，不调用付费模型。

## 初版学习路线与局部关联复核

Agent 先调用 get_knowledge_graph，再自行按用户主题选择真实起点、终点、必学点，调用 plan_learning_route。算法先通过 BFS 找主线，再反向多源 BFS 寻找未覆盖必学点到现有子图的最近接入，反复合并；已配置的先修基础会递归补齐，并保留 AND 依赖及检测先修循环。

结果是含分支的学习子图，不承诺一条连续遍历全部必学点的路线。related 关系展开为双向探索，prerequisite 严格保留方向。词汇相似度不改变原图边权、不自动增删图谱连线。

初筛使用中文字符 2/3-gram 与术语的二值 TF-IDF 余弦相似度、IDF 加权标签交集比，以及至多 6 节点局部窗口的描述关联证据。不部署小模型、不调用 embedding API。初版阈值为试验值（描述关联 .12、标签 .15、局部上下文 .08 等），未经教学标注校准；缺失描述、低词汇证据、证据冲突会进入 reviewQueue，而非直接判为无关。全局主题适配仍需 LLM 结合教师描述解释，统计初筛不能代替此判断。

Agent 接到 needs_review 后应以教师描述、标签、用户主题为依据，对每条可疑连接给出 keep/unrelated/uncertain 和窗口内证据 ID，调用 review_learning_route。要求全部覆盖、禁止重复/伪造依据；已确认先修冲突不能被模型意见覆盖。复核未完成、仍存无关或不确定连接、不可达必学点时，最终交付状态标为 partial。unrelated 返回可排除的边，可用 blockedEdges 重新规划，原始图谱不变；提示词限制最多重规划两次。

候选方案及复核上下文在内存中保存 20 分钟，限 128 份，绑定用户与 Agent run；图谱/资源变化后必须重新规划。单次最多 12 个必学点、60 个选中节点、100 个复核片段、开放计算范围最多 1000 节点。初版每次工具调用生成一份候选，不保证全局最优或三条互异路线。未接入能力证据驱动的自动跳课；进度不能当作已验证掌握。

验证：apps/api 中运行 npx tsx --test src/modules/agent/learning-route.test.ts；npx tsx src/scripts/verify-learning-route.ts 使用真实数据库只读事务验证工具分发和模拟复核协议，不请求付费模型。真实 LLM 的判断质量与阈值还需另用教师标注样例评估。
