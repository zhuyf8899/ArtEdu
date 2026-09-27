-- 标准的「正/负提示词 → 图像生成」节点工作流。
-- 学生点开就能跑：填一句需求、看一眼负向词，剩下的（导入模型 → 采样 → 预览）自动执行。
BEGIN;

INSERT INTO workflows (id, name, description, category, entry_type, entry_url, status, created_by)
VALUES (
  'workflow-prompt-image',
  '正负提示词图像生成',
  '标准的文生图链路：创作需求 → 正向提示词 → 负向提示词 → 图像模型 → 生成图片 → 结果预览。',
  '通用工作流 · 图像生成',
  'workbench',
  '/studio#workflow-catalog',
  'published',
  'user-teacher-demo'
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  status = 'published',
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO workflow_versions (id, workflow_id, version_number, definition_json, prompt_template, published_at, created_by)
VALUES (
  'workflow-prompt-image-v1',
  'workflow-prompt-image',
  1,
  '{
    "schemaVersion": 2,
    "viewport": { "x": 20, "y": 120, "zoom": 0.72 },
    "nodes": [
      { "id": "n-input", "type": "input", "position": { "x": 60, "y": 200 },
        "data": { "label": "创作需求", "description": "运行时填写本次要生成的主题", "value": "" } },
      { "id": "n-positive", "type": "prompt", "position": { "x": 340, "y": 200 },
        "data": { "label": "正向提示词", "description": "希望画面出现的风格与画质", "value": "艺术教育插画风格，主体明确，构图平衡，柔和自然光，细腻材质，高细节" } },
      { "id": "n-negative", "type": "negative_prompt", "position": { "x": 620, "y": 200 },
        "data": { "label": "负向提示词", "description": "不希望在画面里出现的内容", "value": "文字, 水印, 签名, 低分辨率, 模糊, 变形, 额外肢体, 杂乱背景" } },
      { "id": "n-model", "type": "model", "position": { "x": 900, "y": 200 },
        "data": { "label": "图像模型", "description": "留空使用平台默认图片通道", "value": "" } },
      { "id": "n-sampler", "type": "ksampler", "position": { "x": 1180, "y": 200 },
        "data": { "label": "生成图片", "description": "调用平台图片 API 生成并归档产物", "value": "" } },
      { "id": "n-preview", "type": "preview", "position": { "x": 1460, "y": 200 },
        "data": { "label": "结果预览", "description": "展示生成的图片", "value": "" } }
    ],
    "edges": [
      { "id": "e-input-positive", "source": "n-input", "target": "n-positive", "sourceHandle": "output", "targetHandle": "input" },
      { "id": "e-positive-negative", "source": "n-positive", "target": "n-negative", "sourceHandle": "output", "targetHandle": "input" },
      { "id": "e-negative-model", "source": "n-negative", "target": "n-model", "sourceHandle": "output", "targetHandle": "input" },
      { "id": "e-model-sampler", "source": "n-model", "target": "n-sampler", "sourceHandle": "output", "targetHandle": "input" },
      { "id": "e-sampler-preview", "source": "n-sampler", "target": "n-preview", "sourceHandle": "output", "targetHandle": "input" }
    ]
  }'::jsonb,
  '按创作需求生成图片；负向词可先改成不想要的内容再运行。',
  CURRENT_TIMESTAMP,
  'user-teacher-demo'
)
ON CONFLICT (id) DO UPDATE SET
  definition_json = EXCLUDED.definition_json,
  prompt_template = EXCLUDED.prompt_template,
  published_at = CURRENT_TIMESTAMP;

COMMIT;
