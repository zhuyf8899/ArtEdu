BEGIN;

ALTER TABLE courses ADD COLUMN IF NOT EXISTS cover_url TEXT;
ALTER TABLE course_resources
  ADD COLUMN IF NOT EXISTS summary TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS cover_url TEXT;

ALTER TABLE course_resources DROP CONSTRAINT IF EXISTS course_resources_tags_check;
ALTER TABLE course_resources ADD CONSTRAINT course_resources_tags_check
  CHECK (jsonb_typeof(tags) = 'array');

COMMIT;
