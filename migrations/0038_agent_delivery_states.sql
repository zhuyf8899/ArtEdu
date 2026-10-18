-- Existing runs retain their status. Explicit terminal delivery states avoid false success.
ALTER TABLE agent_runs DROP CONSTRAINT IF EXISTS agent_runs_status_check;
ALTER TABLE agent_runs ADD CONSTRAINT agent_runs_status_check CHECK
  (status IN ('queued','running','waiting_user','succeeded','failed','blocked','cancelled','partial','paused','needs_confirmation'));
