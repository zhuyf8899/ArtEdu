export const GRAPH_LIMITS = { nodes: 80, edges: 160, groups: 20 };

export function graphLimitIssue(graph) {
  if (graph.nodes.length > 80) return '最多 80 个节点';
  if (graph.edges.length > 160) return '最多 160 条连线';
  if ((graph.groups?.length || 0) > 20) return '最多 20 个分组';
  return '';
}

export function nodeSize(node, measured = []) {
  const actual = measured.find(n => n.id === node.id);
  return { width: actual?.measured?.width || node.measured?.width || 300,
    height: actual?.measured?.height || node.measured?.height || 360 };
}

export function groupBounds(graph, measured = []) {
  return (graph.groups || []).flatMap(group => {
    const members = graph.nodes.filter(n => group.nodeIds.includes(n.id));
    if (!members.length) return [];
    const left = Math.min(...members.map(n => n.position.x)) - 24;
    const top = Math.min(...members.map(n => n.position.y)) - 48;
    const right = Math.max(...members.map(n => n.position.x + nodeSize(n, measured).width)) + 24;
    const bottom = Math.max(...members.map(n => n.position.y + nodeSize(n, measured).height)) + 24;
    return [{ ...group, left, top, width: right - left, height: bottom - top }];
  });
}

export function layoutGraph(graph, measured = []) {
  const ranks = new Map(), visiting = new Set();
  const rank = id => {
    if (ranks.has(id)) return ranks.get(id);
    if (visiting.has(id)) throw Error('工作流不能包含循环连接；请使用有上限的循环节点');
    visiting.add(id);
    const value = Math.max(0, ...graph.edges.filter(e => e.target === id).map(e => rank(e.source) + 1));
    visiting.delete(id); ranks.set(id, value); return value;
  };
  graph.nodes.forEach(n => rank(n.id));
  const widths = [], offsets = [], heights = [];
  graph.nodes.forEach(n => { const r = ranks.get(n.id); widths[r] = Math.max(widths[r] || 0, nodeSize(n, measured).width); });
  for (let r = 0; r < widths.length; r++) offsets[r] = r ? offsets[r - 1] + widths[r - 1] + 100 : 70;
  return graph.nodes.map(n => {
    const r = ranks.get(n.id), y = heights[r] || 70;
    heights[r] = y + nodeSize(n, measured).height + 90;
    return { ...n, position: { x: offsets[r], y } };
  });
}

// A selector's unused input does not keep an otherwise unused branch alive.
// Shared ancestors and branches leading to other terminal outputs remain active.
export function requiredNodeIds(definition) {
  const edges = definition.edges || [], required = new Set();
  const visit = id => {
    if (required.has(id)) return;
    required.add(id);
    const node = definition.nodes.find(n => n.id === id);
    edges.filter(e => e.target === id && (node?.type !== 'result_select' || e.targetHandle === (node.data?.selection || 'a'))).forEach(e => visit(e.source));
  };
  definition.nodes.filter(n => !edges.some(e => e.source === n.id)).forEach(n => visit(n.id));
  return required;
}

export function edgeIsActive(edge, results = {}) {
  const result = results[edge.source];
  if (!result || result.kind === 'skipped') return false;
  if (result.kind === 'failed') return edge.sourceHandle === 'error';
  if (edge.sourceHandle === 'error') return false;
  if (result.kind === 'condition') return (edge.sourceHandle || 'true') === (result.matched ? 'true' : 'false');
  return true;
}

export function conditionMatches(data, state) {
  const value = String(state[data.field || 'text'] ?? ''), expected = String(data.value ?? '');
  switch (data.operator || 'contains') {
    case 'equals': return value === expected;
    case 'not_empty': return Boolean(value.trim());
    case 'contains': return value.includes(expected);
    default: throw Error('未知条件运算符');
  }
}

export function skipNode(definition, id, results = {}) {
  if (!requiredNodeIds(definition).has(id)) return true;
  const incoming = definition.edges.filter(e => e.target === id);
  return incoming.length > 0 && incoming.every(e => results[e.source] && !edgeIsActive(e, results));
}
