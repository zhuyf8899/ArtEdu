-- 设计工作台与案例社区：工作流执行留痕、外部资源投稿。

BEGIN;

ALTER TABLE work_assets
  ALTER COLUMN storage_key DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS external_url TEXT;

ALTER TABLE work_assets
  DROP CONSTRAINT IF EXISTS work_assets_location_check;

ALTER TABLE work_assets
  ADD CONSTRAINT work_assets_location_check
  CHECK (storage_key IS NOT NULL OR external_url IS NOT NULL);

CREATE TABLE IF NOT EXISTS workflow_runs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  workflow_id TEXT NOT NULL,
  workflow_version_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'in_progress'
    CHECK (status IN ('in_progress', 'completed', 'cancelled')),
  current_step INTEGER NOT NULL DEFAULT 0 CHECK (current_step >= 0),
  total_steps INTEGER NOT NULL DEFAULT 0 CHECK (total_steps >= 0),
  context_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE RESTRICT,
  FOREIGN KEY (workflow_version_id) REFERENCES workflow_versions(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS workflow_run_events (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  step_index INTEGER NOT NULL CHECK (step_index >= 0),
  event_type TEXT NOT NULL CHECK (event_type IN ('start', 'complete', 'skip', 'note')),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (run_id) REFERENCES workflow_runs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_workflow_runs_user_updated
  ON workflow_runs(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_workflow_run_events_run
  ON workflow_run_events(run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_work_assets_external_url
  ON work_assets(external_url) WHERE external_url IS NOT NULL;

COMMIT;
