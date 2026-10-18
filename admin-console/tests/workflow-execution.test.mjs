import test from 'node:test';
import assert from 'node:assert/strict';
import { hasDownstreamPrompt, platformPublishIssues } from '../src/workflowExecution.js';
import { additionalPlatformNodes, createPlatformPreset, platformInputPorts } from '../src/platformNodeCatalog.js';
const node = (id, type, value = '') => ({ id, type, data: { label: id, value } });
const edge = (source, target) => ({ source, target });
test('自然的正负提示词分支无需人为增加创作输入节点', () => {
  assert.deepEqual(platformPublishIssues({ nodes: [node('p', 'prompt', '海报'), node('n', 'negative_prompt', '水印'), node('m', 'prompt_merge'), node('g', 'ksampler'), node('s', 'save_image')], edges: [edge('p', 'm'), edge('n', 'm'), edge('m', 'g'), edge('g', 's')] }), []);
});
test('发布前指出图片保存缺少生图、提示词为空、合并缺少来源', () => {
  assert.match(platformPublishIssues({ nodes: [node('i', 'input'), node('s', 'save_image')], edges: [edge('i', 's')] })[0], /图片生成/);
  assert.match(platformPublishIssues({ nodes: [node('p', 'prompt'), node('s', 'preview')], edges: [edge('p', 's')] })[0], /需要填写/);
  assert.match(platformPublishIssues({ nodes: [node('m', 'prompt_merge'), node('s', 'preview')], edges: [edge('m', 's')] })[0], /连接上游/);
});
test('另一分支的提示词不能让当前创作输入自动跳过', () => {
  const nodes = [node('a', 'input'), node('b', 'input'), node('p', 'prompt', '海报')];
  assert.equal(hasDownstreamPrompt(nodes, [edge('b', 'p')], 'a'), false);
  assert.equal(hasDownstreamPrompt(nodes, [edge('b', 'p')], 'b'), true);
});

test('新增九种节点带有明确用途、分组和输入端口，模板可以直接预检', () => {
  assert.equal(Object.keys(additionalPlatformNodes).length, 9);
  for (const meta of Object.values(additionalPlatformNodes)) {
    assert.ok(meta.hint.length > 10); assert.ok(meta.output); assert.ok(meta.group);
  }
  assert.deepEqual(platformInputPorts('text_constant'), []);
  assert.deepEqual(platformInputPorts('text_join').map(([id]) => id), ['a', 'b']);
  assert.match(additionalPlatformNodes.result_select.hint, /两路上游都会执行/);
  let serial = 0;
  for (const kind of ['prompt-tools', 'text-join']) {
    const definition = createPlatformPreset(kind, prefix => `${prefix}-${++serial}`);
    assert.deepEqual(platformPublishIssues(definition), []);
    assert.equal(new Set(definition.nodes.map(node => node.id)).size, definition.nodes.length);
    assert.ok(definition.edges.every(edge => definition.nodes.some(node => node.id === edge.source) && definition.nodes.some(node => node.id === edge.target)));
  }
});

test('新增节点的预检提示缺失端口、文字和模板占位符', () => {
  assert.match(platformPublishIssues({ nodes: [node('join', 'text_join'), node('out', 'text_preview')], edges: [edge('join', 'out')] })[0], /A、B/);
  assert.match(platformPublishIssues({ nodes: [node('template', 'text_template', '{text}'), node('out', 'text_preview')], edges: [edge('template', 'out')] })[0], /缺少上游数据/);
  assert.match(platformPublishIssues({ nodes: [node('template', 'text_template', '{unknown}'), node('out', 'text_preview')], edges: [edge('template', 'out')] })[0], /仅支持/);
  assert.match(platformPublishIssues({ nodes: [node('replace', 'text_replace'), node('out', 'text_preview')], edges: [edge('replace', 'out')] })[0], /查找文字/);
});

test('选择器只按所选分支的类型预检下游，不能借另一条分支的图片绕过校验', () => {
  const definition = { nodes: [node('input', 'input'), node('image', 'ksampler'), node('text', 'text_constant', '文字'), { ...node('select', 'result_select'), data: { selection: 'b' } }, node('save', 'save_image')], edges: [edge('input', 'image'), { ...edge('image', 'select'), targetHandle: 'a' }, { ...edge('text', 'select'), targetHandle: 'b' }, edge('select', 'save')] };
  assert.match(platformPublishIssues(definition)[0], /图片生成/);
  definition.nodes.find(node => node.id === 'select').data.selection = 'a';
  assert.deepEqual(platformPublishIssues(definition), []);
});
