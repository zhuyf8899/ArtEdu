ALTER TABLE agent_runs
  ADD COLUMN bridge_device_id TEXT REFERENCES local_bridge_devices(id),
  ADD COLUMN bridge_lease_id UUID,
  ADD COLUMN bridge_lease_expires_at TIMESTAMPTZ;

ALTER TABLE atomic_assets
  ADD COLUMN sha256 TEXT CHECK (sha256 ~ '^[0-9a-f]{64}$');

CREATE TABLE workspace_preview_grants (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  directory TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL '5 minutes')
);
CREATE INDEX workspace_preview_grants_expiry ON workspace_preview_grants(expires_at);
