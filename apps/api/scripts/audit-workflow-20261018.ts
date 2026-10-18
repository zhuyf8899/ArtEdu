import assert from 'node:assert/strict';
import { StudioService } from '../src/modules/studio/studio.service';

// Isolated audit: no database, network, model calls, or existing user data.
const actor = { id: 'audit-user', roles: ['student'] } as any;
const node = (id: string, type: string, value = '') => ({ id, type, position: { x: 0, y: 0 }, data: { label: id, value } });
const edge = (source: string, target: string) => ({ id: `${source}-${target}`, source, target });
function harness(definition: any) {
  const row: any = { id: 'audit-run', user_id: actor.id, workflow_id: 'audit-flow', status: 'in_progress', current_step: 0, total_steps: definition.nodes.length, context_json: { initialPrompt: '', initialSize: '1024x1024', nodeResults: {}, nodeStates: {} }, definition_json: definition };
  const query = async (sql: string, values: any[] = []) => {
    if (sql.includes('SELECT r.*,w.name')) return { rows: [structuredClone(row)], rowCount: 1 };
    if (sql.includes('RETURNING id') && sql.includes('context_json=jsonb_set')) return { rows: [{ id: row.id }], rowCount: 1 };
    if (sql.includes('UPDATE workflow_runs SET context_json=$2')) { row.context_json = JSON.parse(values[1]); row.current_step = values[2]; row.status = values[3]; }
    if (sql.includes('UPDATE workflow_runs SET current_step=$2')) { row.current_step = values[1]; row.status = values[2]; }
    return { rows: [], rowCount: 1 };
  };
  return { row, service: new StudioService({ query, transaction: async (fn: any) => fn({ query }) } as any, {} as any) };
}
async function main() {
  const results: any[] = [];
  for (const reverse of [false, true]) {
    const parents = [edge('a', 'out'), edge('b', 'out')];
    const definition = { nodes: [node('in', 'input', '主题'), node('a', 'prompt', '红色'), node('b', 'prompt', '圆形'), node('out', 'preview')], edges: [edge('in', 'a'), edge('in', 'b'), ...(reverse ? parents.reverse() : parents)] };
    const { row, service } = harness(definition);
    for (let i = 0; i < 4; i++) await service.executeRun(actor, row.id, {});
    const text = row.context_json.nodeResults.out.text;
    assert.equal(text, reverse ? '主题\n红色' : '主题\n圆形');
    results.push({ issue: 'branch-overwrite', reverseEdges: reverse, actual: text });
  }
  {
    const definition = { nodes: [node('in', 'input', '主题'), node('note', 'note', '说明'), node('out', 'preview')], edges: [edge('in', 'note'), edge('note', 'out')] };
    const { row, service } = harness(definition);
    await service.executeRun(actor, row.id, {});
    await service.updateRun(actor, row.id, { stepIndex: 1, action: 'complete' });
    await assert.rejects(() => service.executeRun(actor, row.id, {}), /上游节点尚未全部执行/);
    results.push({ issue: 'manual-note-completion-blocks-downstream', currentStep: row.current_step });
  }
  {
    const definition = { nodes: [node('in', 'input', '主题'), node('out', 'save_image')], edges: [edge('in', 'out')] };
    const { row, service } = harness(definition);
    (service as any).assertExecutableDefinition(definition);
    await service.executeRun(actor, row.id, {});
    await assert.rejects(() => service.executeRun(actor, row.id, {}), /保存图片前必须先完成图片生成/);
    results.push({ issue: 'publish-validation-accepts-impossible-image-save' });
  }
  {
    const { service } = harness({ nodes: [], edges: [] });
    const context = (service as any).workflowContext({ modelConfigId: 'explicit-model' });
    const output = await (service as any).executeNode(actor, node('default', 'model'), context);
    assert.equal(output.modelConfigId, 'internal-default');
    assert.equal(context.modelConfigId, 'explicit-model');
    results.push({ issue: 'default-model-node-keeps-previous-explicit-model', displayed: output.modelConfigId, actual: context.modelConfigId });
  }
  console.log(JSON.stringify({ confirmed: results }, null, 2));
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
