-- 可选的临时生图通道。只有 MODEL_PROVIDERS_JSON 配置了同 id 的适配器，
-- 且服务器注入 SILICONFLOW_API_KEY 时，平台才会使用它。
INSERT INTO model_providers (id, name, provider_type, status)
VALUES ('provider-siliconflow', '硅基流动 SiliconFlow', 'domestic', 'active')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, status = EXCLUDED.status;

INSERT INTO model_configs (
  id, provider_id, display_name, model_identifier, capabilities_json, secret_ref, status
)
VALUES (
  'model-siliconflow-kolors', 'provider-siliconflow', 'SiliconFlow Kolors 临时生图',
  'Kwai-Kolors/Kolors', '["image","pattern"]'::jsonb, 'env:SILICONFLOW_API_KEY', 'active'
)
ON CONFLICT (id) DO UPDATE SET
  provider_id = EXCLUDED.provider_id,
  display_name = EXCLUDED.display_name,
  model_identifier = EXCLUDED.model_identifier,
  capabilities_json = EXCLUDED.capabilities_json,
  secret_ref = EXCLUDED.secret_ref,
  status = EXCLUDED.status,
  updated_at = CURRENT_TIMESTAMP;
