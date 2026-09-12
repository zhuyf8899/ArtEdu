-- 将默认文本模型切换至 DeepSeek Flash。模型供应商当前使用的正式标识为
-- deepseek-flash；deepseek-v4-flash 仅保留为兼容别名，历史记录不受影响。

UPDATE model_configs
SET model_identifier = 'deepseek-flash',
    display_name = 'DeepSeek Flash',
    capabilities_json = '["chat","webpage","document"]'::jsonb,
    status = 'active',
    updated_at = CURRENT_TIMESTAMP
WHERE id = 'model-deepseek-v4-flash';

UPDATE model_configs
SET status = 'disabled',
    updated_at = CURRENT_TIMESTAMP
WHERE id = 'model-deepseek-v4-pro'
  AND status = 'active';
