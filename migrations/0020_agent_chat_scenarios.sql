BEGIN;
ALTER TABLE agent_runs DROP CONSTRAINT agent_runs_scenario_check;
ALTER TABLE agent_runs ADD CONSTRAINT agent_runs_scenario_check
  CHECK (scenario IN ('chat', 'ui_design', 'webpage_generation', 'pattern_generation', 'document_generation'));
COMMIT;
