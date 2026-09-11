-- 创作附件是短期工作区数据：独立于课程与作品资源，按用户配额并自动过期。
BEGIN;

CREATE TABLE IF NOT EXISTS temporary_creation_uploads (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  conversation_local_id TEXT,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  storage_key TEXT NOT NULL UNIQUE,
  size_bytes BIGINT NOT NULL CHECK (size_bytes >= 0),
  sha256 TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_accessed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_temporary_creation_uploads_active_user
  ON temporary_creation_uploads (user_id, expires_at)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_temporary_creation_uploads_expiry
  ON temporary_creation_uploads (expires_at)
  WHERE deleted_at IS NULL;

COMMIT;
