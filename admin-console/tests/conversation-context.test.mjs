import test from 'node:test';
import assert from 'node:assert/strict';
import { makeModelContext } from '../src/conversationStore.js';
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
