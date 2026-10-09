BEGIN;
CREATE FUNCTION refresh_knowledge_labels_trigger() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN PERFORM refresh_knowledge_labels(); RETURN NULL; END $$;
CREATE TRIGGER courses_knowledge_labels AFTER INSERT OR UPDATE OR DELETE ON courses FOR EACH STATEMENT EXECUTE FUNCTION refresh_knowledge_labels_trigger();
CREATE TRIGGER lessons_knowledge_labels AFTER INSERT OR UPDATE OR DELETE ON course_lessons FOR EACH STATEMENT EXECUTE FUNCTION refresh_knowledge_labels_trigger();
CREATE TRIGGER workflows_knowledge_labels AFTER INSERT OR UPDATE OR DELETE ON workflows FOR EACH STATEMENT EXECUTE FUNCTION refresh_knowledge_labels_trigger();
CREATE TRIGGER versions_knowledge_labels AFTER INSERT OR UPDATE OR DELETE ON workflow_versions FOR EACH STATEMENT EXECUTE FUNCTION refresh_knowledge_labels_trigger();
COMMIT;
