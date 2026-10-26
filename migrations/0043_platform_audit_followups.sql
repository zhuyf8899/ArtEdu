BEGIN;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;
ALTER TABLE learning_tasks ADD COLUMN IF NOT EXISTS target_revision INTEGER CHECK(target_revision > 0);
ALTER TABLE learning_tasks DROP CONSTRAINT IF EXISTS learning_tasks_task_type_check;
ALTER TABLE learning_tasks ADD CONSTRAINT learning_tasks_task_type_check CHECK(task_type IN ('course','lesson','workflow','review','note','custom','atom'));
CREATE TABLE tool_recommendations (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), title TEXT NOT NULL,
 url TEXT NOT NULL, reason TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','rejected')),
 feedback TEXT NOT NULL DEFAULT '', reviewer_id TEXT REFERENCES users(id),
 created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, decided_at TIMESTAMPTZ
);
CREATE INDEX tool_recommendations_owner ON tool_recommendations(user_id,created_at DESC);
CREATE INDEX tool_recommendations_queue ON tool_recommendations(status,created_at);
CREATE TABLE atomic_starter_sources (
 owner_id TEXT NOT NULL REFERENCES users(id), lesson_id TEXT NOT NULL REFERENCES course_lessons(id),
 node_id TEXT NOT NULL REFERENCES atomic_nodes(id), PRIMARY KEY(owner_id,lesson_id)
);
COMMIT;
