-- Existing deployments have already applied 0009, so document export capability
-- must be added in a new idempotent migration rather than editing old history.
UPDATE model_configs
SET capabilities_json = CASE
  WHEN capabilities_json @> '["document"]'::jsonb THEN capabilities_json
  ELSE capabilities_json || '["document"]'::jsonb
END,
updated_at = CURRENT_TIMESTAMP
WHERE id = 'model-deepseek-v4-flash';
