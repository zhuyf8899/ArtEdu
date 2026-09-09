INSERT INTO model_providers (id, name, provider_type, status)
VALUES ('provider-deepseek', 'DeepSeek', 'international', 'active')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, status = EXCLUDED.status;

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
