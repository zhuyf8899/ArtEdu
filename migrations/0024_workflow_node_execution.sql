-- 节点画布执行记录：保留既有人工完成事件，同时记录服务端实际节点执行。
BEGIN;

ALTER TABLE workflow_run_events DROP CONSTRAINT IF EXISTS workflow_run_events_event_type_check;
ALTER TABLE workflow_run_events
  ADD CONSTRAINT workflow_run_events_event_type_check
  CHECK (event_type IN ('start', 'complete', 'skip', 'note', 'execute', 'error'));

COMMIT;
