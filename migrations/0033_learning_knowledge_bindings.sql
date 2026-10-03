-- Empty by default: never infer knowledge, tool use or mastery from historical records.
BEGIN;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS knowledge_points JSONB NOT NULL DEFAULT '[]'::jsonb
  CHECK (jsonb_typeof(knowledge_points) = 'array' AND jsonb_array_length(knowledge_points) <= 20);
ALTER TABLE course_lessons ADD COLUMN IF NOT EXISTS knowledge_points JSONB NOT NULL DEFAULT '[]'::jsonb
  CHECK (jsonb_typeof(knowledge_points) = 'array' AND jsonb_array_length(knowledge_points) <= 20);
-- Workflow bindings live in immutable workflow_versions.definition_json.learning.
-- Existing runs continue referencing the version they actually ran.
COMMIT;
