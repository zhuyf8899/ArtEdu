-- Additive: no legacy course, lesson, note or progress is rewritten.
BEGIN;
CREATE TABLE atomic_nodes (
 id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('teaching','reflection','course')),
 owner_id TEXT NOT NULL REFERENCES users(id), parent_id TEXT REFERENCES atomic_nodes(id),
 published_revision INTEGER, created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK ((kind='reflection') = (parent_id IS NOT NULL))
);
CREATE TABLE atomic_versions (
 node_id TEXT NOT NULL REFERENCES atomic_nodes(id), revision INTEGER NOT NULL CHECK(revision>0),
 payload JSONB NOT NULL CHECK(jsonb_typeof(payload)='object'),
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','pending_review','published','rejected')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(node_id,revision)
);
ALTER TABLE atomic_nodes ADD CONSTRAINT atomic_published_version_fk FOREIGN KEY(id,published_revision) REFERENCES atomic_versions(node_id,revision) DEFERRABLE INITIALLY DEFERRED;
CREATE TABLE atomic_assets (
 id TEXT PRIMARY KEY, node_id TEXT NOT NULL REFERENCES atomic_nodes(id),
 storage_key TEXT NOT NULL, file_name TEXT NOT NULL, mime_type TEXT NOT NULL, size_bytes BIGINT NOT NULL CHECK(size_bytes>0)
);
CREATE TABLE atomic_progress (
 user_id TEXT NOT NULL REFERENCES users(id), node_id TEXT NOT NULL, revision INTEGER NOT NULL,
 stage TEXT NOT NULL CHECK(stage IN ('read','submitted','completed','needs_revision')),
 submission TEXT NOT NULL DEFAULT '', feedback TEXT NOT NULL DEFAULT '', reviewer_id TEXT REFERENCES users(id),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(user_id,node_id,revision), FOREIGN KEY(node_id,revision) REFERENCES atomic_versions(node_id,revision)
);
CREATE TABLE atomic_task_submissions (
 user_id TEXT NOT NULL REFERENCES users(id), course_id TEXT NOT NULL, revision INTEGER NOT NULL,
 atom_id TEXT NOT NULL REFERENCES atomic_nodes(id), submission TEXT NOT NULL,
 stage TEXT NOT NULL CHECK(stage IN ('submitted','completed','needs_revision')), feedback TEXT NOT NULL DEFAULT '',
 reviewer_id TEXT REFERENCES users(id), updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(user_id,course_id,revision,atom_id), FOREIGN KEY(course_id,revision) REFERENCES atomic_versions(node_id,revision)
);
CREATE TABLE atomic_audit (
 id TEXT PRIMARY KEY, node_id TEXT NOT NULL REFERENCES atomic_nodes(id), revision INTEGER NOT NULL,
 actor_id TEXT NOT NULL REFERENCES users(id), action TEXT NOT NULL, note TEXT NOT NULL DEFAULT '',
 created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX atomic_nodes_owner ON atomic_nodes(owner_id,created_at DESC);
CREATE INDEX atomic_nodes_parent ON atomic_nodes(parent_id);
CREATE INDEX atomic_versions_queue ON atomic_versions(status,node_id,revision);
COMMIT;
