-- ModelScope（魔搭）文生图接入 + 修正模型能力声明。
--
-- 背景：ModelRegistry.getForJob 取「第一个声明支持该任务类型的适配器」。
-- 0014 让 DeepSeek V4 Pro 声明了 image/pattern，但它走的是 chat/completions，
-- 只会返回文字方案；不修正的话图片任务会被路由到文本模型，永远出不了图。
-- 因此：DeepSeek 只保留它真正能做的 chat/webpage/document，图像与图案交给 ModelScope。
--
-- 与 MODEL_PROVIDERS_JSON 中同 id 的条目配合生效：portal 只暴露
-- status='active' 且 id 出现在该环境变量里的模型，两者缺一不可。
-- 文生图协议在该环境变量里用 "protocol":"modelscope-image" 声明。

INSERT INTO model_providers (id, name, provider_type, status)
VALUES ('provider-modelscope', 'ModelScope 魔搭', 'domestic', 'active')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, status = EXCLUDED.status;

INSERT INTO model_configs (
  id, provider_id, display_name, model_identifier, capabilities_json, secret_ref, status
)
VALUES (
  'model-modelscope-qwen-image',
  'provider-modelscope',
  'ModelScope 通义千问图像',
  'Qwen/Qwen-Image',
  '["image","pattern"]'::jsonb,
  'env:MODELSCOPE_API',
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

-- 文本模型不再声明图像/图案能力（它没有对应的图像生成通道）。
UPDATE model_configs
SET capabilities_json = '["chat","webpage","document"]'::jsonb,
    updated_at = CURRENT_TIMESTAMP
WHERE id = 'model-deepseek-v4-pro';
