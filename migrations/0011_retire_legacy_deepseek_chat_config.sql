-- 停用旧版 Agent 直连配置，门户只展示带额度、任务状态和使用记录的正式模型配置。
UPDATE model_configs
SET status = 'disabled', updated_at = CURRENT_TIMESTAMP
WHERE id = 'deepseek-chat';
