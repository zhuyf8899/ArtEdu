-- Optional API image editing channel. Runtime configuration and credentials
-- still come from MODEL_PROVIDERS_JSON and BAILIAN_API_KEY; no keys are stored.
-- Register the same ID used by the configured Wanx adapter so the generation
-- job's model foreign key and reference validation can succeed.
INSERT INTO model_providers (id, name, provider_type, status)
VALUES ('provider-bailian', '阿里云百炼 Bailian', 'domestic', 'active')
ON CONFLICT (id) DO NOTHING;

INSERT INTO model_configs (
  id, provider_id, display_name, model_identifier, capabilities_json, secret_ref, status
)
VALUES (
  'model-bailian-wanx-edit', 'provider-bailian', '万相图片编辑 API',
  'wanx2.1-imageedit', '["image","pattern"]'::jsonb, 'env:BAILIAN_API_KEY', 'active'
)
ON CONFLICT (id) DO NOTHING;
