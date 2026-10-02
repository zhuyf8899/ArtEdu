-- Four-view learning map. Source records remain in the existing course, workflow and work tables.
BEGIN;

CREATE TABLE knowledge_nodes (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  domain TEXT NOT NULL DEFAULT 'general',
  sort_order INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE knowledge_edges (
  from_node_id TEXT NOT NULL REFERENCES knowledge_nodes(id) ON DELETE CASCADE,
  to_node_id TEXT NOT NULL REFERENCES knowledge_nodes(id) ON DELETE CASCADE,
  relation TEXT NOT NULL CHECK (relation IN ('prerequisite', 'related')),
  PRIMARY KEY (from_node_id, to_node_id, relation),
  CHECK (from_node_id <> to_node_id)
);

CREATE TABLE knowledge_bindings (
  node_id TEXT NOT NULL REFERENCES knowledge_nodes(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('course', 'lesson', 'workflow', 'tool')),
  target_id TEXT NOT NULL,
  PRIMARY KEY (node_id, target_type, target_id)
);

CREATE TABLE ability_goals (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE knowledge_ability_goals (
  node_id TEXT NOT NULL REFERENCES knowledge_nodes(id) ON DELETE CASCADE,
  goal_id TEXT NOT NULL REFERENCES ability_goals(id) ON DELETE CASCADE,
  PRIMARY KEY (node_id, goal_id)
);

CREATE TABLE knowledge_activity_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  node_id TEXT NOT NULL REFERENCES knowledge_nodes(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL CHECK (activity_type IN ('learn', 'practice', 'create')),
  minutes INTEGER NOT NULL DEFAULT 0 CHECK (minutes BETWEEN 0 AND 1440),
  note TEXT NOT NULL DEFAULT '',
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE tool_usage_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tool_id TEXT NOT NULL REFERENCES tools(id) ON DELETE CASCADE,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_knowledge_nodes_published ON knowledge_nodes(status, sort_order, id);
CREATE INDEX idx_knowledge_bindings_target ON knowledge_bindings(target_type, target_id);
CREATE INDEX idx_knowledge_activity_user_time ON knowledge_activity_events(user_id, occurred_at DESC);
CREATE INDEX idx_tool_usage_user_time ON tool_usage_events(user_id, occurred_at DESC);

COMMIT;
