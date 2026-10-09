# 知识图谱后端（第一阶段）

学生端知识地图、能力目标、工具轨迹、成长记录与教师管理页面现已接入。路径、标签同步、迁移和验证详见 [知识图谱数据库闭环](knowledge-map-integration.md)。已有课程、课时、工作流、工具、作品记录仍是事实来源；知识图谱只保存知识点、关系和指向这些资源的绑定。

## 用户接口

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| GET | `/api/me/knowledge-map` | 知识点、连线、资源绑定、个人进度与最多 3 个下一步推荐 |
| GET | `/api/me/ability-portrait` | 能力目标及关联知识点的平均进度 |
| GET | `/api/me/tool-trail` | 已发布工具、关联知识点、通过工作流产生的使用次数 |
| GET | `/api/me/growth-record` | 最近 100 条活动、课时完成、工作流完成、作品记录及汇总 |
| POST | `/api/me/knowledge-activities` | 记录学习、练习或创作活动，字段 `nodeId`, `activityType`, `minutes`, `note`, `occurredAt` |
| POST | `/api/me/tool-usage` | 记录一次直接使用工具，字段 `toolId` |

所有用户接口需要登录。活动时间允许过去一年内的记录，不能超过当前时间一分钟。成长记录会汇总已有的作品及其上传资源；工具轨迹同时展示工作流关联工具使用和直接使用次数。

## 内容维护接口

管理员或教师可以使用 `GET /api/admin/knowledge-map` 获取草稿和已发布内容；使用 `POST /api/admin/knowledge-nodes`、`PATCH /api/admin/knowledge-nodes/:nodeId`、`POST /api/admin/ability-goals`、`PATCH /api/admin/ability-goals/:goalId` 创建和更新节点与目标；使用 `PUT /api/admin/knowledge-nodes/:nodeId/links` 一次替换某节点的出边、资源绑定和能力目标绑定。替换在事务内完成，并验证目标存在、去重和前置关系无环。节点及能力目标默认是草稿，需要明确发布。

关系 `prerequisite` 从前置节点指向后续节点；`related` 仅用于展示。知识点进度取相关事实的最高分：已完成课时/工作流或创作活动为 100，练习为 70，学习记录为 30；课程绑定按已发布课时的平均进度计算。这个分数是第一阶段的展示规则，后续可由课程评价体系替换。没有绑定的已发布节点仍可通过活动记录推进。

资源绑定使用 `targetType`（`course`、`lesson`、`workflow`、`tool`）及 `targetId`。写入时应用层校验目标存在；由于一列要引用四张不同表，数据库不使用多态外键。删除原资源后的孤立绑定不会贡献进度，维护人员可重新保存节点关联清理。

迁移文件：`migrations/0033_knowledge_map.sql`。在部署前执行现有 `npm run db:migrate`；这次本地实现不改服务器。
