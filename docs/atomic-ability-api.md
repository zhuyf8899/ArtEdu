# 原子学习与个人能力接口

迁移：0042_atomic_ability_evidence.sql。新增表均为增量，不修改旧课程记录。

## 关联接口

`PUT /api/atomic/nodes/:id/knowledge`

请求：`{"revision":1,"knowledgeNodeIds":["knowledge-id"]}`。
教师只能维护自己的教学原子，管理员可维护所有教学原子。知识点必须已发布，ID 去重且最多 20 项。关联按原子版本保存；新版本需显式关联。变更写入 atomic_audit，并同步回填已有学习者的能力记录。

## 个人能力

`GET /api/atomic/abilities`：返回 nodes（能力知识点及各状态统计）、evidence（原子各历史版本证据、反馈、评价人、时间）和 goals（公开能力目标与知识点映射）。只查询当前会话用户。

既有 `GET /api/me/ability-portrait` 增加 atomicLearning 字段，旧 goals 保持兼容。旧 goals 的课程百分比仍是旧逻辑，不等于新的原子学习统计。

`GET /api/atomic/knowledge/:id`：返回公开知识点、关联的当前公开原子与个人已学历史版本、公开前置与相关关系。用户进度按当前身份隔离。前端可由此展示主题与学习入口。

## 后端持久化

atomic_knowledge_bindings：原子版本与知识点关联。
user_atomic_ability_evidence：各用户的版本学习证据。
user_knowledge_abilities：按用户、知识点持久化的去重统计。

数据库触发器在原子阅读、练习提交、评价和关联调整时同步更新以上证据与统计，和原操作共享事务。历史版本分别保留；统计对同一知识点的同一原子使用最新已学版本。阅读自我确认与教师评价分别统计，evaluatedCount 只统计练习完成且有评价人的原子。课程专属任务仍独立保存，不重复计为原子能力。

没有原子关联时，个人能力返回空数组。接口不根据文字标签猜测知识点。知识点归档后个人历史证据仍保留；主题学习入口只开放公开知识点。

验证：`node scripts/verify-atomic-abilities.mjs` 在本地数据库内使用回滚事务，覆盖学习阶段变化、历史版本去重、用户隔离及关联回填。单元测试：`npx tsx --test src/modules/atomic/atomic-ability.test.ts`（apps/api）。
