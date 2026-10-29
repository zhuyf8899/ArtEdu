/** Validate data dependencies without requiring optional runtime user input. */
export function platformPublishIssues(definition) {
  const unsupported = definition.nodes.find(node => ['lora', 'controlnet', 'upscale', 'text_encode', 'load_checkpoint', 'vae_decode'].includes(node.type));
  if (unsupported) return [`“${unsupported.data?.label || unsupported.type}”尚未接入对应的 API 运算能力，请移除后发布`];
  if (definition.nodes.every(node => node.type === 'note')) return [];
  if (!definition.nodes.some(node => ['preview', 'save_image', 'text_preview'].includes(node.type))) return ['需要一个成果预览或保存节点'];
  const fields = new Map();
  const pending = [...definition.nodes];
  while (pending.length) {
    const index = pending.findIndex(node => definition.edges.filter(edge => edge.target === node.id).every(edge => fields.has(edge.source)));
    if (index < 0) return ['工作流存在循环或无效连接'];
    const [node] = pending.splice(index, 1);
    const incoming = definition.edges.filter(edge => edge.target === node.id);
    const parents = incoming.filter(edge => node.type !== 'result_select' || edge.targetHandle === (node.data?.selection ?? 'a'));
    const available = new Set(parents.flatMap(edge => [...fields.get(edge.source)]));
    if (incoming.some(edge => edge.sourceHandle === 'error')) available.add('text');
    const label = node.data?.label || node.id;
    if (node.type === 'text_replace' && !node.data?.find) return [`“${label}”需要填写非空的查找文字`];
    if (node.type === 'text_template') {
      const value = String(node.data?.value ?? '');
      if (!value.trim()) return ['提示词模板不能为空'];
      if (/\{([^{}]+)\}/g.test(value.replace(/\{(?:text|prompt|negative)\}/g, ''))) return ['模板仅支持 {text}、{prompt}、{negative} 占位符'];
      for (const [key, field] of [['text', 'text'], ['prompt', 'prompt'], ['negative', 'negativePrompt']]) if (value.includes(`{${key}}`) && !available.has(field)) return [`“${label}”的 {${key}} 占位符缺少上游数据`];
    }
    if (['text_join', 'result_select'].includes(node.type) && ['a', 'b'].some(port => incoming.filter(edge => edge.targetHandle === port).length !== 1)) return [`“${label}”的 A、B 端口需要各连接一路输入`];
    if (node.type === 'loop') {
      if (!Number.isInteger(node.data?.iterations) || node.data.iterations < 1 || node.data.iterations > 20) return ['循环次数必须为 1 至 20'];
      if (!['text_template','text_replace','text_generate'].includes(node.data.operation)) return ['请选择循环操作'];
      if (!available.has('text') && !available.has('prompt')) return ['循环节点需要上游文字'];
      if (node.data.operation === 'text_replace' && !node.data.find) return ['循环替换需要非空查找文字'];
      if (node.data.operation === 'text_template' && (!String(node.data.value || '').includes('{text}') || /\{(?!text\}|index\})[^{}]+\}/.test(node.data.value))) return ['循环模板需要 {text}，可使用 {index}'];
      available.add('text'); available.add('prompt');
    }
    if (node.type === 'text_constant') available.add('text');
    if (node.type === 'text_join') {
      if (parents.some(edge => !['text', 'prompt'].some(field => fields.get(edge.source)?.has(field)))) return ['文本拼接的每一路输入都需要文字或正向提示词'];
      available.add('text');
    }
    if (['text_replace', 'text_to_prompt', 'text_to_negative', 'text_preview'].includes(node.type) && !available.has('text') && !available.has('prompt')) return [`“${label}”需要连接文字或正向提示词`];
    if (['text_replace', 'text_template', 'text_preview'].includes(node.type)) available.add('text');
    if (node.type === 'text_to_prompt') { available.delete('text'); available.add('prompt'); }
    if (node.type === 'text_to_negative') { available.delete('text'); available.delete('prompt'); available.add('negativePrompt'); }
    if (node.type === 'negative_prompt') available.add('negativePrompt');
    if (node.type === 'reroute' && incoming.length !== 1) return ['数据转接需要且只能连接一路输入'];
    if (['prompt', 'skill'].includes(node.type) && !String(node.data?.value ?? '').trim()) return [`“${label}”需要填写提示词或创作约束`];
    if (['input', 'prompt', 'skill'].includes(node.type)) available.add('prompt');
    if (['text_generate', 'ksampler'].includes(node.type) && !available.has('prompt')) return [`“${label}”需要连接创作输入或正向提示词`];
    if (node.type === 'text_generate') { available.add('text'); available.add('prompt'); }
    if (node.type === 'ksampler') available.add('artifact');
    if (node.type === 'save_image' && !available.has('artifact')) return [`“${label}”需要连接图片生成节点的输出`];
    if (node.type === 'prompt_merge' && !parents.length) return ['提示词合并节点需要连接上游提示词'];
    fields.set(node.id, available);
  }
  return [];
}

// Only prompts downstream of this input can make that input optional.
export function hasDownstreamPrompt(nodes, edges, inputId) {
  const reached = new Set([inputId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const edge of edges) if (reached.has(edge.source) && !reached.has(edge.target)) { reached.add(edge.target); changed = true; }
  }
  return nodes.some(node => reached.has(node.id) && ((['prompt', 'skill', 'text_encode'].includes(node.type) && String(node.data?.value ?? '').trim()) || (node.type === 'text_template' && String(node.data?.value ?? '').trim() && !/\{(?:text|prompt)\}/.test(node.data.value))));
}
