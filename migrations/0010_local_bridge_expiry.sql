ALTER TABLE local_bridge_devices ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

UPDATE local_bridge_devices
SET expires_at = COALESCE(expires_at, created_at + INTERVAL '30 days')
WHERE expires_at IS NULL;

ALTER TABLE local_bridge_devices
  ALTER COLUMN expires_at SET DEFAULT (CURRENT_TIMESTAMP + INTERVAL '30 days'),
  ALTER COLUMN expires_at SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_local_bridge_devices_token_expiry
  ON local_bridge_devices(token_hash, status, expires_at);
