-- 目录元数据与试学讲义；不删除或迁移任何个人学习记录。
BEGIN;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS catalog_json JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE course_lessons ADD COLUMN IF NOT EXISTS teaching_json JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE tool_directory_links ADD COLUMN IF NOT EXISTS catalog_json JSONB NOT NULL DEFAULT '{}'::jsonb;
CREATE TABLE IF NOT EXISTS content_bundle_installs (
  id TEXT PRIMARY KEY,
  checksum TEXT NOT NULL,
  snapshot_json JSONB NOT NULL,
  installed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  rolled_back_at TIMESTAMPTZ
);
COMMIT;
