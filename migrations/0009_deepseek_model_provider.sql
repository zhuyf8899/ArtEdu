INSERT INTO model_providers (id, name, provider_type, status)
VALUES ('provider-deepseek', 'DeepSeek', 'international', 'active')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, status = EXCLUDED.status;

-- 兼容早期部署：旧版使用 deepseek-chat 作为配置 ID，且与正式配置
-- 共用同一 provider/model 唯一组合。保留旧记录（及其关联的历史用量），
-- 但从可执行模型中退出，为正式配置释放唯一键。
UPDATE model_configs
SET model_identifier = 'deepseek-v4-flash-legacy',
    status = 'disabled',
    updated_at = CURRENT_TIMESTAMP
WHERE provider_id = 'provider-deepseek'
  AND model_identifier = 'deepseek-v4-flash'
  AND id <> 'model-deepseek-v4-flash';

INSERT INTO model_configs (
  id, provider_id, display_name, model_identifier, capabilities_json, secret_ref, status
)
VALUES (
  'model-deepseek-v4-flash',
  'provider-deepseek',
  'DeepSeek V4 Flash',
  'deepseek-v4-flash',
  '["chat","image","pattern","webpage"]'::jsonb,
  'env:DEEPSEEK_API_KEY',
  'active'
)
ON CONFLICT (id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  model_identifier = EXCLUDED.model_identifier,
  capabilities_json = EXCLUDED.capabilities_json,
  secret_ref = EXCLUDED.secret_ref,
  status = EXCLUDED.status,
  updated_at = CURRENT_TIMESTAMP;
