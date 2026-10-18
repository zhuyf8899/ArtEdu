const textColor = '#639ed8', promptColor = '#b268ff', controlColor = '#d6b335';
export const additionalPlatformNodes = {
  text_constant: { title: '文本常量', hint: '保存一段可复用的文字，连接文字处理或提示词转换节点', color: textColor, group: '文字处理', inputs: [], output: '文字', valueLabel: '文本内容', defaultValue: '青绿色艺术海报' },
  text_join: { title: '文本拼接', hint: '按 A、B 端口顺序拼接两段文字；分隔符可自定义', color: textColor, group: '文字处理', inputs: [['a', '文字 A'], ['b', '文字 B']], output: '拼接后的文字', defaults: { separator: '\n' } },
  text_replace: { title: '查找替换', hint: '对上游文字作精确替换，查找内容按普通文字匹配', color: textColor, group: '文字处理', inputs: [['input', '文字 / 提示词']], output: '替换后的文字', defaults: { find: '模糊', replacement: '清晰' } },
  text_template: { title: '提示词模板', hint: '用 {text}、{prompt}、{negative} 插入上游内容，生成一段新文字', color: promptColor, group: '提示与教学', inputs: [['input', '文字 / 生成条件']], output: '模板文字', valueLabel: '模板内容', defaultValue: '主题：{text}\n要求：构图清晰，色彩协调。' },
  text_to_prompt: { title: '文字转正向', hint: '将上游文字设为新的正向提示词，再连接合并或图片生成', color: promptColor, group: '提示与教学', inputs: [['input', '文字']], output: '正向提示词' },
  text_to_negative: { title: '文字转负向', hint: '将上游文字设为新的负向提示词，再连接提示词合并的负向端口', color: promptColor, group: '提示与教学', inputs: [['input', '文字']], output: '负向提示词' },
  text_preview: { title: '文字预览', hint: '查看当前文字或提示词，可作为流程终点，也可继续连接下游', color: '#42b883', group: '输出与说明', inputs: [['input', '文字 / 提示词']], output: '文字' },
  reroute: { title: '数据转接', hint: '原样传递一路文字、生成条件或图片，整理跨区域连线', color: controlColor, group: '流程控制', inputs: [['input', '任意一路数据']], output: '原样数据' },
  result_select: { title: '结果选择', hint: '选择 A 或 B 路的完整结果。两路上游都会执行，不会节省另一条分支的模型调用', color: controlColor, group: '流程控制', inputs: [['a', '结果 A'], ['b', '结果 B']], output: '选定的一路结果', defaults: { selection: 'a' } },
};

export function platformInputPorts(type) {
  if (additionalPlatformNodes[type]) return additionalPlatformNodes[type].inputs;
  if (type === 'prompt_merge') return [['positive', '正向提示词'], ['negative', '负向提示词']];
  return type === 'input' ? [] : [['input', '输入']];
}

export function createPlatformPreset(kind, makeId) {
  const nodes = [], edges = [];
  const add = (type, x, y, data = {}) => {
    const meta = additionalPlatformNodes[type];
    const id = makeId(type);
    nodes.push({ id, type, position: { x, y }, data: { label: meta.title, description: meta.hint, value: meta.defaultValue ?? '', ...meta.defaults, ...data } });
    return id;
  };
  const link = (source, target, targetHandle = 'input') => edges.push({ id: makeId('edge'), source, sourceHandle: 'output', target, targetHandle });
  if (kind === 'prompt-tools') {
    const text = add('text_constant', 0, 0, { value: '传统纹样海报，模糊背景' });
    const replace = add('text_replace', 310, 0);
    const template = add('text_template', 620, 0);
    const prompt = add('text_to_prompt', 930, 0);
    const preview = add('text_preview', 1240, 0);
    link(text, replace); link(replace, template); link(template, prompt); link(prompt, preview);
  } else if (kind === 'text-join') {
    const a = add('text_constant', 0, 0, { label: '主题文字', value: '青绿色传统纹样海报' });
    const b = add('text_constant', 0, 350, { label: '风格文字', value: '柔和自然光，平面插画' });
    const join = add('text_join', 320, 120), preview = add('text_preview', 640, 120);
    link(a, join, 'a'); link(b, join, 'b'); link(join, preview);
  } else throw new Error('未知工作流模板');
  return { nodes, edges };
}
