BEGIN;
CREATE TABLE atomic_knowledge_bindings (
 atom_id TEXT NOT NULL, revision INTEGER NOT NULL, knowledge_node_id TEXT NOT NULL REFERENCES knowledge_nodes(id),
 created_by TEXT REFERENCES users(id), created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(atom_id,revision,knowledge_node_id),
 FOREIGN KEY(atom_id,revision) REFERENCES atomic_versions(node_id,revision)
);
CREATE INDEX atomic_knowledge_node_idx ON atomic_knowledge_bindings(knowledge_node_id);
CREATE TABLE user_atomic_ability_evidence (
 user_id TEXT NOT NULL REFERENCES users(id), knowledge_node_id TEXT NOT NULL REFERENCES knowledge_nodes(id),
 atom_id TEXT NOT NULL, revision INTEGER NOT NULL, stage TEXT NOT NULL CHECK(stage IN ('read','submitted','completed','needs_revision')),
 completion TEXT NOT NULL CHECK(completion IN ('read','practice')), feedback TEXT NOT NULL DEFAULT '', reviewer_id TEXT REFERENCES users(id),
 learned_at TIMESTAMPTZ NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(user_id,knowledge_node_id,atom_id,revision),
 FOREIGN KEY(user_id,atom_id,revision) REFERENCES atomic_progress(user_id,node_id,revision)
);
CREATE TABLE user_knowledge_abilities (
 user_id TEXT NOT NULL REFERENCES users(id), knowledge_node_id TEXT NOT NULL REFERENCES knowledge_nodes(id),
 atom_count INTEGER NOT NULL, read_count INTEGER NOT NULL, submitted_count INTEGER NOT NULL,
 completed_count INTEGER NOT NULL, needs_revision_count INTEGER NOT NULL, evaluated_count INTEGER NOT NULL,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(user_id,knowledge_node_id)
);
CREATE FUNCTION refresh_atomic_abilities(learner TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('atomic-ability:'||learner,0));
 DELETE FROM user_atomic_ability_evidence WHERE user_id=learner;
 INSERT INTO user_atomic_ability_evidence(user_id,knowledge_node_id,atom_id,revision,stage,completion,feedback,reviewer_id,learned_at)
 SELECT p.user_id,b.knowledge_node_id,p.node_id,p.revision,p.stage,v.payload->>'completion',p.feedback,p.reviewer_id,p.updated_at
 FROM atomic_progress p JOIN atomic_knowledge_bindings b ON b.atom_id=p.node_id AND b.revision=p.revision
 JOIN atomic_nodes n ON n.id=p.node_id AND n.kind='teaching'
 JOIN atomic_versions v ON v.node_id=p.node_id AND v.revision=p.revision AND v.status='published'
 WHERE p.user_id=learner;
 DELETE FROM user_knowledge_abilities WHERE user_id=learner;
 INSERT INTO user_knowledge_abilities(user_id,knowledge_node_id,atom_count,read_count,submitted_count,completed_count,needs_revision_count,evaluated_count)
 SELECT user_id,knowledge_node_id,COUNT(*),COUNT(*) FILTER(WHERE stage='read'),COUNT(*) FILTER(WHERE stage='submitted'),
 COUNT(*) FILTER(WHERE stage='completed'),COUNT(*) FILTER(WHERE stage='needs_revision'),
 COUNT(*) FILTER(WHERE stage='completed' AND completion='practice' AND reviewer_id IS NOT NULL)
 FROM (SELECT DISTINCT ON(knowledge_node_id,atom_id) * FROM user_atomic_ability_evidence WHERE user_id=learner
 ORDER BY knowledge_node_id,atom_id,revision DESC) evidence GROUP BY user_id,knowledge_node_id;
END $$;
CREATE FUNCTION atomic_ability_progress_changed() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
 PERFORM refresh_atomic_abilities(CASE WHEN TG_OP='DELETE' THEN OLD.user_id ELSE NEW.user_id END);
 RETURN NULL;
END $$;
CREATE TRIGGER atomic_progress_abilities AFTER INSERT OR UPDATE OR DELETE ON atomic_progress FOR EACH ROW EXECUTE FUNCTION atomic_ability_progress_changed();
CREATE FUNCTION atomic_ability_binding_changed() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE learner TEXT;
BEGIN
 FOR learner IN SELECT DISTINCT user_id FROM atomic_progress WHERE node_id=CASE WHEN TG_OP='DELETE' THEN OLD.atom_id ELSE NEW.atom_id END ORDER BY user_id LOOP
  PERFORM refresh_atomic_abilities(learner);
 END LOOP;
 RETURN NULL;
END $$;
CREATE TRIGGER atomic_binding_abilities AFTER INSERT OR DELETE ON atomic_knowledge_bindings FOR EACH ROW EXECUTE FUNCTION atomic_ability_binding_changed();
COMMIT;
