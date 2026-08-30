-- 课程资源正式业务：发布审核、选课、工作流课时与生成结果留痕。

BEGIN;

ALTER TABLE courses
  ADD COLUMN IF NOT EXISTS slug TEXT,
  ADD COLUMN IF NOT EXISTS rejection_note TEXT,
  ADD COLUMN IF NOT EXISTS version_number INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS estimated_minutes INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;

ALTER TABLE courses
  DROP CONSTRAINT IF EXISTS courses_status_check;

ALTER TABLE courses
  ADD CONSTRAINT courses_status_check
  CHECK (status IN ('draft', 'pending_review', 'published', 'rejected', 'archived'));

ALTER TABLE courses
  DROP CONSTRAINT IF EXISTS courses_version_number_check;

ALTER TABLE courses
  ADD CONSTRAINT courses_version_number_check CHECK (version_number >= 1);

ALTER TABLE courses
  DROP CONSTRAINT IF EXISTS courses_estimated_minutes_check;

ALTER TABLE courses
  ADD CONSTRAINT courses_estimated_minutes_check CHECK (estimated_minutes >= 0);

UPDATE courses
SET
  slug = COALESCE(slug, id),
  published_at = CASE WHEN status = 'published' THEN COALESCE(published_at, created_at) ELSE published_at END,
  estimated_minutes = CASE
    WHEN estimated_minutes = 0 THEN COALESCE((
      SELECT SUM(COALESCE(cl.estimated_minutes, 0))::INTEGER
      FROM course_lessons cl
      WHERE cl.course_id = courses.id
    ), 0)
    ELSE estimated_minutes
  END;

ALTER TABLE courses ALTER COLUMN slug SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_courses_slug ON courses(slug);

ALTER TABLE course_lessons
  ADD COLUMN IF NOT EXISTS workflow_id TEXT,
  ADD COLUMN IF NOT EXISTS model_config_ids JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE course_lessons
  DROP CONSTRAINT IF EXISTS course_lessons_lesson_type_check;

ALTER TABLE course_lessons
  ADD CONSTRAINT course_lessons_lesson_type_check
  CHECK (lesson_type IN ('lesson', 'practice', 'assignment', 'workflow'));

ALTER TABLE course_lessons
  DROP CONSTRAINT IF EXISTS fk_course_lessons_workflow;

ALTER TABLE course_lessons
  ADD CONSTRAINT fk_course_lessons_workflow
  FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE SET NULL;

ALTER TABLE course_lessons
  DROP CONSTRAINT IF EXISTS course_lessons_model_config_ids_check;

ALTER TABLE course_lessons
  ADD CONSTRAINT course_lessons_model_config_ids_check
  CHECK (jsonb_typeof(model_config_ids) = 'array');

CREATE TABLE IF NOT EXISTS course_enrollments (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  course_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'in_progress'
    CHECK (status IN ('in_progress', 'completed', 'withdrawn')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, course_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS course_reviews (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL,
  submitter_id TEXT NOT NULL,
  reviewer_id TEXT,
  snapshot_version INTEGER NOT NULL CHECK (snapshot_version >= 1),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  note TEXT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  decided_at TIMESTAMPTZ,
  FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
  FOREIGN KEY (submitter_id) REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY (reviewer_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_course_reviews_pending
  ON course_reviews(course_id) WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS learning_generation_outputs (
  generation_output_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  course_id TEXT NOT NULL,
  lesson_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (generation_output_id) REFERENCES generation_outputs(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
  FOREIGN KEY (lesson_id) REFERENCES course_lessons(id) ON DELETE CASCADE
);

ALTER TABLE audit_records
  DROP CONSTRAINT IF EXISTS audit_records_target_type_check;

ALTER TABLE audit_records
  ADD CONSTRAINT audit_records_target_type_check
  CHECK (target_type IN (
    'work', 'work_asset', 'course', 'course_resource', 'course_review',
    'course_enrollment', 'comment', 'user', 'user_usage_limit'
  ));

ALTER TABLE audit_records
  DROP CONSTRAINT IF EXISTS audit_records_action_check;

ALTER TABLE audit_records
  ADD CONSTRAINT audit_records_action_check
  CHECK (action IN (
    'submit', 'approve', 'reject', 'archive', 'publish', 'enroll',
    'update_progress', 'update_quota', 'enable', 'disable'
  ));

CREATE INDEX IF NOT EXISTS idx_courses_catalog
  ON courses(status, is_featured DESC, featured_rank, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_course_lessons_course_sort
  ON course_lessons(course_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_course_enrollments_user
  ON course_enrollments(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_course_reviews_status
  ON course_reviews(status, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_learning_generation_outputs_lesson
  ON learning_generation_outputs(user_id, lesson_id, created_at DESC);

COMMIT;
