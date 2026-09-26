BEGIN;

ALTER TABLE courses ADD COLUMN IF NOT EXISTS cover_mime_type TEXT;
ALTER TABLE course_resources
  ADD COLUMN IF NOT EXISTS cover_asset_key TEXT,
  ADD COLUMN IF NOT EXISTS cover_mime_type TEXT;

COMMIT;
