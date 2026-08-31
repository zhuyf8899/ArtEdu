-- 我的学习：学习计划、笔记与个人学习空间聚合业务。

BEGIN;

CREATE TABLE IF NOT EXISTS learning_tasks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  task_type TEXT NOT NULL DEFAULT 'custom'
    CHECK (task_type IN ('course', 'workflow', 'review', 'note', 'custom')),
  target_id TEXT,
  due_date DATE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'completed')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS learning_notes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  course_id TEXT,
  lesson_id TEXT,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE SET NULL,
  FOREIGN KEY (lesson_id) REFERENCES course_lessons(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_learning_tasks_user_status_due
  ON learning_tasks(user_id, status, due_date, sort_order);
CREATE INDEX IF NOT EXISTS idx_learning_notes_user_updated
  ON learning_notes(user_id, updated_at DESC);

COMMIT;
