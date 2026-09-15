-- Collected cases remain drafts until attribution and publication permission are confirmed.
-- Keep the uploader (works.author_id) separate from the original creators in story_json.
ALTER TABLE works ADD COLUMN IF NOT EXISTS story_json jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE works ADD CONSTRAINT works_story_object CHECK (jsonb_typeof(story_json) = 'object');
