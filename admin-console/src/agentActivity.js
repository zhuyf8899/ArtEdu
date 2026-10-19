const toolLabels = {
  search_web: '联网搜索', search_platform: '搜索平台内容', list_published_content: '读取已发布内容',
  'model.invoke': '调用模型', 'agent.execute': '执行任务', 'request.prepare': '准备任务',
  'artifact.generate': '生成产物',
  'generation.image': '生成图片', 'generation.pattern': '生成图案', 'generation.document': '生成文档',
  get_course_lesson:'读取课程与课时', search_course_knowledge:'检索课程知识',
  get_workflow_detail:'读取工作流', get_case_detail:'读取案例', search_cases:'搜索案例',
  list_courses:'列出课程', list_workflows:'列出工作流', get_workflow_run_result:'读取运行结果',
  list_saved_artifacts:'读取成果草稿', generate_document:'生成文档', list_uploaded_files:'列出参考文件',
  read_uploaded_file:'读取参考文件', list_workspace_files:'查看工作区文件', change_workspace_directory:'切换工作目录',
  read_workspace_file:'读取工作区文件', write_workspace_file:'写入工作区文件', create_workspace_directory:'创建工作目录',
  write_workspace_files:'写入多个文件', open_workspace_file:'打开工作区文件', check_page:'检查网页',
  create_agent_artifact:'保存成果草稿', start_workflow_run:'启动工作流', harness_probe:'检查执行环境',
  generate_image:'生成图片',
};
export function activityLabel(event) {
  const label = toolLabels[event.name] || (event.kind === 'tool' ? `调用工具 ${event.name}` : event.name);
  const statuses={running:'进行中',succeeded:'已完成',failed:'失败',paused:'已暂停',partial:'部分完成',needs_confirmation:'等待确认',validation_failed:'检查未通过'};
  return `${label}：${statuses[event.status]||event.status}`;
}
export function visibleActivities(events = []) {
  const calls = new Map();
  for (const event of events) {
    if (event.name === 'harness_probe') continue;
    const previous = calls.get(event.id);
    calls.set(event.id, { ...event, at: previous?.at || event.at });
  }
  return [...calls.values()];
}
// The collapsed record shows one truthful status, never the full tool log.
// A terminal run wins over stale running steps left by an interrupted stream.
export function executionSummary(events = []) {
  const records = visibleActivities(events);
  if (!records.length) return null;
  const run = records.find(event => event.kind === 'run');
  const active = [...records].reverse().find(event => event.status === 'running');
  const current = run && run.status !== 'running' ? run : active ?? run ?? records.at(-1);
  return { label: activityLabel(current), status: current.status, count: records.length };
}
export function appendActivity(events = [], event) {
  if (!event || !['model','tool','run'].includes(event.kind) || !['running','succeeded','failed','paused','partial','needs_confirmation','validation_failed'].includes(event.status)) return events;
  if (typeof event.id !== 'string' || typeof event.name !== 'string') return events;
  // Deliberately exclude arguments and outputs from persisted UI events.
  const clean = { id: event.id.slice(0,240), kind: event.kind, name: event.name.slice(0,120), status: event.status, at: event.at || new Date().toISOString(), ...(Number.isInteger(event.round) ? { round: event.round } : {}) };
  if (events.some(item => item.id === clean.id && item.status === clean.status)) return events;
  return [...events, clean];
}
export function settleActivity(events = [], status = 'paused') {
  const latest = new Map(events.map(event => [event.id,event]));
  return [...latest.values()].filter(event => event.status === 'running').reduce((items,event) => appendActivity(items,{...event,status,at:new Date().toISOString()}),events);
}
export function recoverExecution(conversation) {
  const prompt = conversation.pending?.prompt;
  const consumed = typeof prompt === 'string' && (conversation.messages || []).some(message => message.role === 'user' && (message.content === prompt || message.content?.startsWith(`${prompt}\n\n📎`)));
  return {...conversation, pending:consumed ? null : conversation.pending, messages:(conversation.messages || []).map(message => message.streaming ? {...message, streaming:false, paused:true, placeholder:undefined, content:message.content || '连接已中断，可重新发送继续。', activity:settleActivity(message.activity,'paused')} : message)};
}
