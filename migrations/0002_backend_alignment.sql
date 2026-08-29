-- 后端第一版需要的最小结构补齐。
-- 1. 管理端需要并发任务上限，沿用既有 user_usage_limits 通用模型。
-- 2. 审核页面需要追溯作品所使用的模型与提示词，因此关联作品和生成任务。

BEGIN;

ALTER TABLE user_usage_limits
  DROP CONSTRAINT IF EXISTS user_usage_limits_period_type_check;

ALTER TABLE user_usage_limits
  ADD CONSTRAINT user_usage_limits_period_type_check
  CHECK (period_type IN ('daily', 'monthly', 'total', 'concurrent'));

ALTER TABLE audit_records
  DROP CONSTRAINT IF EXISTS audit_records_target_type_check;

ALTER TABLE audit_records
  ADD CONSTRAINT audit_records_target_type_check
  CHECK (target_type IN ('work', 'work_asset', 'course', 'course_resource', 'comment', 'user', 'user_usage_limit'));

ALTER TABLE audit_records
  DROP CONSTRAINT IF EXISTS audit_records_action_check;

ALTER TABLE audit_records
  ADD CONSTRAINT audit_records_action_check
  CHECK (action IN ('submit', 'approve', 'reject', 'archive', 'update_quota', 'enable', 'disable'));

CREATE TABLE IF NOT EXISTS work_generation_jobs (
  work_id TEXT NOT NULL,
  generation_job_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (work_id, generation_job_id),
  FOREIGN KEY (work_id) REFERENCES works(id) ON DELETE CASCADE,
  FOREIGN KEY (generation_job_id) REFERENCES generation_jobs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_work_generation_jobs_job
  ON work_generation_jobs(generation_job_id);

COMMIT;
