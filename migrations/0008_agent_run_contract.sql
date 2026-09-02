CREATE TABLE IF NOT EXISTS agent_runs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  scenario TEXT NOT NULL CHECK (scenario IN ('ui_design', 'webpage_generation', 'pattern_generation')),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'waiting_user', 'succeeded', 'failed', 'blocked', 'cancelled')),
  input_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  failure_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS agent_run_messages (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'agent', 'system', 'tool')),
  content TEXT NOT NULL,
  scan_status TEXT NOT NULL DEFAULT 'safe' CHECK (scan_status IN ('safe', 'warning', 'blocked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS agent_tool_calls (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  tool_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('started', 'succeeded', 'failed')),
  input_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  output_json JSONB,
  error_message TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS agent_artifacts (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  artifact_type TEXT NOT NULL CHECK (artifact_type IN ('brief', 'prompt', 'webpage', 'image', 'pattern', 'document', 'preview')),
  storage_key TEXT,
  external_url TEXT,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  scan_status TEXT NOT NULL DEFAULT 'safe' CHECK (scan_status IN ('safe', 'warning', 'blocked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (storage_key IS NOT NULL OR external_url IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS agent_content_scans (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('input', 'message', 'tool_call', 'artifact')),
  target_id TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('warning', 'high')),
  rule_type TEXT NOT NULL CHECK (rule_type IN ('keyword')),
  matched_rule TEXT NOT NULL,
  redacted_excerpt TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS agent_security_alerts (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  severity TEXT NOT NULL CHECK (severity IN ('warning', 'high')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'resolved')),
  summary TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by TEXT REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_agent_runs_user_created ON agent_runs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_runs_status_created ON agent_runs(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_messages_run_created ON agent_run_messages(run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_agent_tool_calls_run_created ON agent_tool_calls(run_id, started_at);
CREATE INDEX IF NOT EXISTS idx_agent_artifacts_run_created ON agent_artifacts(run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_agent_alerts_status_created ON agent_security_alerts(status, created_at DESC);
