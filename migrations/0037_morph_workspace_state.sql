-- UI-specific preferences and drafts only. Courses, works and learning records
-- continue to use their existing business tables and permissions.
CREATE TABLE IF NOT EXISTS morph_workspace_state (
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  state_key text NOT NULL CHECK (state_key IN ('profile','favorites','remixes','tool-submissions','curriculum-paths','creation-records')),
  value_json jsonb NOT NULL,
  version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, state_key)
);
