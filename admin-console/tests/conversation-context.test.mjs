import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_WORKSPACE, conversationWorkspace, conversationsInWorkspace, createConversation, makeModelContext, workspaceLabel,
} from '../src/conversationStore.js';
import { readFile } from 'node:fs/promises';

test('long conversations stay within API limits and exclude failed replies', () => {
  const messages = Array.from({length: 48}, (_, i) => ({role: i % 2 ? 'assistant' : 'user', content: String(i)}));
  messages.push({role:'assistant',content:'request failed',failed:true});
  messages.push({role:'user',content:'x'.repeat(22000)});
  const result = makeModelContext({memory:'previous context',messages});
  assert.equal(result.length,30);
  assert.equal(result.at(-1).content.length,20000);
  assert.ok(!result.some(m => m.content === 'request failed'));
});

test('database migration accepts every public agent scenario', async () => {
  const contracts = await readFile(new URL('../../apps/api/src/modules/agent/agent.contracts.ts',import.meta.url),'utf8');
  const migration = await readFile(new URL('../../migrations/0020_agent_chat_scenarios.sql',import.meta.url),'utf8');
  const values = contracts.match(/agentScenarioSchema = z.enum\(\[([^\]]+)\]/)[1].matchAll(/"([^"]+)"/g);
  for (const [, value] of values) assert.ok(migration.includes(`'${value}'`), value);
});

test('没有工作区字段的历史对话归入默认工作区，不会被丢弃', () => {
  assert.equal(DEFAULT_WORKSPACE, '');
  assert.equal(conversationWorkspace({ id: 'legacy' }), DEFAULT_WORKSPACE);
  assert.equal(conversationWorkspace({ workspace: '   ' }), DEFAULT_WORKSPACE);
  assert.equal(conversationWorkspace({ workspace: ' 纹样项目 ' }), '纹样项目');
  assert.equal(workspaceLabel(''), '默认工作区');
  assert.equal(workspaceLabel('纹样项目'), '纹样项目');
});

test('对话按工作区分组，新建对话落在指定工作区', () => {
  const conversations = [
    { id: 'a', workspace: '纹样项目', updatedAt: '2026-09-16T10:00:00.000Z' },
    { id: 'b', updatedAt: '2026-09-16T09:00:00.000Z' },
    { id: 'c', workspace: '网页原型', updatedAt: '2026-09-16T08:00:00.000Z' },
  ];
  assert.deepEqual(conversationsInWorkspace(conversations, '纹样项目').map((item) => item.id), ['a']);
  assert.deepEqual(conversationsInWorkspace(conversations, DEFAULT_WORKSPACE).map((item) => item.id), ['b']);
  assert.deepEqual(conversationsInWorkspace(conversations, '不存在').map((item) => item.id), []);

  const created = createConversation('user-a', 'ui', '新创作对话', '纹样项目');
  assert.equal(created.workspace, '纹样项目');
  assert.equal(created.userId, 'user-a');
  assert.equal(createConversation('user-a').workspace, DEFAULT_WORKSPACE);
});
