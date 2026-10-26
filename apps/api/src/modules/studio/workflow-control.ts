import { BadRequestException } from '@nestjs/common';

type Graph = { nodes: Array<Record<string, any>>; edges: Array<Record<string, any>> };

export function requiredNodes(graph: Graph) {
  const required = new Set<string>();
  const visit = (id: string) => {
    if (required.has(id)) return;
    required.add(id);
    const node = graph.nodes.find(n => n.id === id);
    graph.edges.filter(e => e.target === id && (node?.type !== 'result_select' || e.targetHandle === (node.data?.selection ?? 'a'))).forEach(e => visit(e.source));
  };
  graph.nodes.filter(n => !graph.edges.some(e => e.source === n.id)).forEach(n => visit(n.id));
  return required;
}

export function activeEdge(edge: Record<string, any>, results: Record<string, any>) {
  const result = results[edge.source];
  if (!result || result.kind === 'skipped') return false;
  if (result.kind === 'failed') return edge.sourceHandle === 'error';
  if (edge.sourceHandle === 'error') return false;
  if (result.kind === 'condition') return (edge.sourceHandle ?? 'true') === (result.matched ? 'true' : 'false');
  return true;
}

export function matchesCondition(data: Record<string, any>, state: Record<string, any>) {
  const value = String(state[data.field ?? 'text'] ?? ''), expected = String(data.value ?? '');
  switch (data.operator ?? 'contains') {
    case 'equals': return value === expected;
    case 'not_empty': return Boolean(value.trim());
    case 'contains': return value.includes(expected);
    default: throw new BadRequestException('未知条件运算符');
  }
}

export function assertControlParameters(node: Record<string, any>) {
  const data = node.data ?? {};
  if (node.type === 'condition' && (!['text','prompt','negativePrompt','error'].includes(data.field ?? 'text') || !['equals','contains','not_empty'].includes(data.operator ?? 'contains'))) throw new BadRequestException('条件字段或运算符无效');
  if (node.type === 'loop') {
    if (!Number.isInteger(data.iterations) || data.iterations < 1 || data.iterations > 20) throw new BadRequestException('循环次数必须为 1 至 20');
    if (!['text_template','text_replace','text_generate'].includes(data.operation)) throw new BadRequestException('循环支持模板、替换或文字生成');
    if (data.operation === 'text_replace' && !data.find) throw new BadRequestException('循环替换需要非空查找文字');
    if (data.operation === 'text_template' && (!String(data.value ?? '').includes('{text}') || /\{(?!text\}|index\})[^{}]+\}/.test(data.value))) throw new BadRequestException('循环模板需要 {text}，可使用 {index}');
  }
}
