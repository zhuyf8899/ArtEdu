BEGIN;
CREATE TABLE comfy_worker_registry (
 device_id TEXT PRIMARY KEY REFERENCES local_bridge_devices(id) ON DELETE CASCADE,
 nodes_json JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE comfy_jobs (
 run_id TEXT PRIMARY KEY REFERENCES workflow_runs(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL REFERENCES users(id), device_id TEXT REFERENCES local_bridge_devices(id),
 status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','cancelling','completed','failed','cancelled')),
 prompt_json JSONB NOT NULL, progress_json JSONB NOT NULL DEFAULT '{}', error TEXT,
 lease_until TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX comfy_jobs_claim_idx ON comfy_jobs(user_id,status,created_at);
CREATE TABLE comfy_artifacts (
 id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES comfy_jobs(run_id) ON DELETE CASCADE,
 is_preview BOOLEAN NOT NULL DEFAULT FALSE, storage_key TEXT NOT NULL, file_name TEXT NOT NULL, mime_type TEXT NOT NULL, size_bytes BIGINT NOT NULL, sha256 TEXT NOT NULL
);
COMMIT;
