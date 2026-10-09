BEGIN;
ALTER TABLE knowledge_nodes ADD COLUMN source TEXT NOT NULL DEFAULT 'manual' CHECK(source IN ('manual','labels'));
ALTER TABLE knowledge_bindings ADD COLUMN source TEXT NOT NULL DEFAULT 'manual' CHECK(source IN ('manual','labels'));
CREATE INDEX knowledge_bindings_target_idx ON knowledge_bindings(target_type,target_id);
CREATE INDEX knowledge_events_user_idx ON knowledge_activity_events(user_id,occurred_at DESC);
CREATE TABLE knowledge_learning_paths (
 user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 title TEXT NOT NULL DEFAULT '我的学习路径',
 node_ids JSONB NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(node_ids)='array' AND jsonb_array_length(node_ids)<=100),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- Only explicit published labels become nodes. No inference from course titles or progress.
CREATE FUNCTION refresh_knowledge_labels() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(7410633);
 CREATE TEMP TABLE IF NOT EXISTS artedu_label_sources(title TEXT,target_type TEXT,target_id TEXT) ON COMMIT DROP;
 TRUNCATE artedu_label_sources;
 INSERT INTO artedu_label_sources
 SELECT DISTINCT btrim(label), 'course', c.id FROM courses c CROSS JOIN LATERAL jsonb_array_elements_text(c.knowledge_points) label WHERE c.status='published' AND btrim(label)<>''
 UNION
 SELECT DISTINCT btrim(label), 'lesson', l.id FROM course_lessons l JOIN courses c ON c.id=l.course_id CROSS JOIN LATERAL jsonb_array_elements_text(l.knowledge_points) label WHERE c.status='published' AND l.status='published' AND btrim(label)<>''
 UNION
 SELECT DISTINCT btrim(label), 'workflow', w.id FROM workflows w JOIN LATERAL (SELECT definition_json FROM workflow_versions v WHERE v.workflow_id=w.id AND v.published_at IS NOT NULL ORDER BY version_number DESC LIMIT 1) v ON TRUE CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(v.definition_json->'learning'->'knowledgePoints','[]'::jsonb)) label WHERE w.status='published' AND btrim(label)<>'';
 INSERT INTO knowledge_nodes(id,title,domain,status,source)
 SELECT 'knowledge-label-'||md5(lower(title)),min(title),'general','published','labels' FROM artedu_label_sources GROUP BY lower(title)
 ON CONFLICT(id) DO UPDATE SET status='published',updated_at=CURRENT_TIMESTAMP WHERE knowledge_nodes.source='labels';
 DELETE FROM knowledge_bindings WHERE source='labels';
 INSERT INTO knowledge_bindings(node_id,target_type,target_id,source)
 SELECT DISTINCT 'knowledge-label-'||md5(lower(title)),target_type,target_id,'labels' FROM artedu_label_sources ON CONFLICT DO NOTHING;
 UPDATE knowledge_nodes n SET status='archived',updated_at=CURRENT_TIMESTAMP WHERE source='labels' AND NOT EXISTS(SELECT 1 FROM knowledge_bindings b WHERE b.node_id=n.id);
END $$;
SELECT refresh_knowledge_labels();
COMMIT;
