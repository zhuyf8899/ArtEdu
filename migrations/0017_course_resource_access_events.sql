-- SSO 接入前的课程文件访问审计。文件保持私有，所有读取均经过应用层授权。
BEGIN;

CREATE TABLE IF NOT EXISTS course_resource_access_events (
  id TEXT PRIMARY KEY,
  resource_id TEXT NOT NULL REFERENCES course_resources(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  access_kind TEXT NOT NULL CHECK (access_kind IN ('stream', 'download')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_course_resource_access_events_resource
  ON course_resource_access_events(resource_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_course_resource_access_events_user
  ON course_resource_access_events(user_id, created_at DESC);

COMMIT;
