CREATE TABLE atomic_case_links (
  atom_id TEXT NOT NULL REFERENCES atomic_nodes(id) ON DELETE CASCADE,
  work_id TEXT NOT NULL REFERENCES works(id) ON DELETE CASCADE,
  PRIMARY KEY (atom_id, work_id)
);
CREATE INDEX atomic_case_links_work_idx ON atomic_case_links (work_id);
