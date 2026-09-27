-- 课程课时学习闭环、课时作品提交，以及今日任务自动完成记录。
BEGIN;

ALTER TABLE course_lessons
  ADD COLUMN IF NOT EXISTS learning_steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS practice_task TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS completion_criteria TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS requires_work_submission BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS course_lesson_submissions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  lesson_id TEXT NOT NULL REFERENCES course_lessons(id) ON DELETE CASCADE,
  work_id TEXT NOT NULL REFERENCES works(id) ON DELETE CASCADE,
  note TEXT NOT NULL DEFAULT '',
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, lesson_id)
);

ALTER TABLE learning_tasks DROP CONSTRAINT IF EXISTS learning_tasks_task_type_check;
ALTER TABLE learning_tasks ADD CONSTRAINT learning_tasks_task_type_check
  CHECK (task_type IN ('course', 'lesson', 'workflow', 'review', 'note', 'custom'));
CREATE UNIQUE INDEX IF NOT EXISTS idx_learning_tasks_lesson_day
  ON learning_tasks(user_id, target_id, due_date) WHERE task_type = 'lesson';
CREATE INDEX IF NOT EXISTS idx_course_lesson_submissions_user
  ON course_lesson_submissions(user_id, course_id, submitted_at DESC);

COMMIT;
