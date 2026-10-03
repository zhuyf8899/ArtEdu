-- Preserve every existing audit action and add the metadata-only operation.
BEGIN;
ALTER TABLE audit_records DROP CONSTRAINT IF EXISTS audit_records_action_check;
ALTER TABLE audit_records ADD CONSTRAINT audit_records_action_check CHECK (action IN (
  'submit', 'approve', 'reject', 'archive', 'publish', 'enroll',
  'update_progress', 'update_quota', 'enable', 'disable', 'update_knowledge_bindings'
));
COMMIT;
