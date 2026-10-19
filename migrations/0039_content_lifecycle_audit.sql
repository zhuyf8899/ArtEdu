-- Soft deletion only: keep all assets, enrollments, progress and review history.
BEGIN;
ALTER TABLE audit_records DROP CONSTRAINT IF EXISTS audit_records_action_check;
ALTER TABLE audit_records ADD CONSTRAINT audit_records_action_check CHECK (action IN (
  'submit', 'approve', 'reject', 'archive', 'restore', 'publish', 'enroll',
  'update_progress', 'update_quota', 'bulk_update_quota', 'enable', 'disable', 'update_knowledge_bindings'
));
COMMIT;
