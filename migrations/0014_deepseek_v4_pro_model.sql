-- 把默认可执行模型从 DeepSeek V4 Flash 切到 DeepSeek V4 Pro。
-- 0009/0012 已应用到既有环境，因此新增本迁移，而不是修改历史迁移。
-- 旧记录保留（历史用量仍引用它），但退出可执行列表：
-- portal 只暴露 status='active' 且 id 出现在 MODEL_PROVIDERS_JSON 中的模型。

INSERT INTO model_configs (
  id, provider_id, display_name, model_identifier, capabilities_json, secret_ref, status
)
VALUES (
  'model-deepseek-v4-pro',
  'provider-deepseek',
  'DeepSeek V4 Pro',
  'deepseek-v4-pro',
  '["chat","image","pattern","webpage","document"]'::jsonb,
  'env:DEEPSEEK_API_KEY',
  'active'
)
ON CONFLICT (id) DO UPDATE SET
  provider_id = EXCLUDED.provider_id,
  display_name = EXCLUDED.display_name,
  model_identifier = EXCLUDED.model_identifier,
  capabilities_json = EXCLUDED.capabilities_json,
  secret_ref = EXCLUDED.secret_ref,
  status = EXCLUDED.status,
  updated_at = CURRENT_TIMESTAMP;

UPDATE model_configs
SET status = 'disabled',
    updated_at = CURRENT_TIMESTAMP
WHERE id = 'model-deepseek-v4-flash'
  AND status = 'active';
