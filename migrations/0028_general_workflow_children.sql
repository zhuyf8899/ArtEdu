-- 把两条基础能力固定为“通用工作流”的子流程。生产环境不依赖开发用 seed 才能看到它们。
INSERT INTO workflows (id, name, description, category, entry_type, entry_url, status)
VALUES
  ('workflow-case-analysis', '案例分析工作流', '通过结构化步骤拆解作品目标、结构与设计方法。', '通用工作流 · 案例分析', 'chat', '/studio#workflow-catalog', 'published'),
  ('workflow-image-draft', '图片生成工作流', '从创作意图到提示词与结果评估，完成视觉草稿迭代。', '通用工作流 · 图片生成', 'workbench', '/studio#workflow-catalog', 'published')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  status = 'published',
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO workflow_versions (id, workflow_id, version_number, definition_json, prompt_template, published_at)
VALUES
  ('workflow-case-analysis-v1', 'workflow-case-analysis', 1,
   '{"steps":[{"id":"observe","title":"观察与记录","description":"记录构图、色彩、字体、材质和交互等可见事实。","instruction":"从五个角度各写一条观察。","estimatedMinutes":8},{"id":"analyze","title":"结构分析","description":"连接设计决策与目标。","instruction":"选择三个关键决策，说明各自解决的问题。","estimatedMinutes":12},{"id":"reflect","title":"迁移与反思","description":"形成下一次创作可复用的方法。","instruction":"整理方法清单并写出一个待验证假设。","estimatedMinutes":10}]}'::jsonb,
   '请从设计目标、视觉结构和创作方法分析这个案例。', CURRENT_TIMESTAMP),
  ('workflow-image-draft-v1', 'workflow-image-draft', 1,
   '{"steps":[{"id":"brief","title":"定义创作意图","description":"明确受众、媒介与要传达的感受。","instruction":"写一句创作目标和三个视觉关键词。","estimatedMinutes":6},{"id":"references","title":"整理视觉参考","description":"把参考拆为可描述的形式特征。","instruction":"记录色彩、构图、材质和节奏。","estimatedMinutes":10},{"id":"prompt","title":"编写生成提示","description":"组织成结构化图像生成提示。","instruction":"依次写主体、场景、风格、材质、构图、色彩和限制。","estimatedMinutes":10},{"id":"review","title":"评估与迭代","description":"检查结果并决定下一轮调整。","instruction":"从目标一致性、清晰度、原创性和可执行性评分。","estimatedMinutes":8}]}'::jsonb,
   '依据目标和形式关键词，协助组织结构化视觉生成提示。', CURRENT_TIMESTAMP)
ON CONFLICT (id) DO NOTHING;
