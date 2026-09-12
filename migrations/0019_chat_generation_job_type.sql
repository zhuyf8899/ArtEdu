-- 创作任务新增 chat（纯文本问答）。
--
-- 背景：0001 建表时 job_type 的 CHECK 只有
--   image / video / webpage / pattern / document / knowledge_graph
-- 而 ModelCapability、MODEL_PROVIDERS_JSON 与 agent 模块早已支持 chat，
-- 只有创作任务链路到不了。前端默认能力由"生图"改为"学习问答"后，
-- 提交的 job_type='chat' 会被这条 CHECK 直接拒绝，因此必须放开。

ALTER TABLE generation_jobs DROP CONSTRAINT IF EXISTS generation_jobs_job_type_check;
ALTER TABLE generation_jobs ADD CONSTRAINT generation_jobs_job_type_check
  CHECK (job_type IN ('chat', 'image', 'video', 'webpage', 'pattern', 'document', 'knowledge_graph'));
