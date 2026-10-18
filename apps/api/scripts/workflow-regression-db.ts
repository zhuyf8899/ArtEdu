import { config } from 'dotenv';
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { Client } from 'pg';
import { StudioService } from '../src/modules/studio/studio.service';
import { workflowVersionInputSchema } from '../src/modules/studio/studio.contracts';

config({ path: path.resolve('apps/api/.env'), quiet: true } as any);
async function main() {
  if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(process.env.DATABASE_URL!).hostname)) throw Error('Local database only');
  const client = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 });
  const checks: string[] = [];
  await client.connect();
  await client.query('BEGIN');
  try {
    const id = `workflow-qa-${Date.now()}`;
    await client.query('INSERT INTO users(id,username,display_name) VALUES($1,$1,$1)', [id]);
    const actor = { id, username: id, displayName: id, accountStatus: 'active', roles: ['student'] } as any;
    const db = { query: (sql: string, values?: any[]) => client.query(sql, values), transaction: async (fn: any) => fn(client) } as any;
    const calls: any[] = [];
    const generation = { runJob: async (_actor: any, input: any) => { calls.push(input); return { job: { id: 'isolated-job' }, artifact: { id: 'isolated-image', downloadUrl: '/fixture.png' } }; } };
    const service = new StudioService(db, { requireAnyRole: () => {} } as any, generation as any);
    const node = (id: string, type: string, value = '') => ({ id, type, position: { x: 0, y: 0 }, data: { label: id, value } });
    const edge = (source: string, target: string) => ({ id: `${source}-${target}`, source, target });
    const workflow = await service.createWorkflow(actor, { name: '隔离工作流回归', description: '事务回滚', category: '测试', entryType: 'workbench' });
    const input = workflowVersionInputSchema.parse({ publish: false, definition: {
      nodes: [node('input', 'input', '海报'), node('positive', 'prompt', '红色'), node('negative', 'negative_prompt', '水印'), node('merge', 'prompt_merge'), node('generate', 'ksampler'), node('save', 'save_image')],
      edges: [edge('input', 'positive'), edge('positive', 'merge'), edge('negative', 'merge'), edge('merge', 'generate'), edge('generate', 'save')],
    } });
    const first = await service.createWorkflowVersion(actor, workflow.id, input);
    const second = await service.createWorkflowVersion(actor, workflow.id, input);
    assert.equal(second.versionNumber, first.versionNumber + 1);
    checks.push('draft-save-and-version-increment');
    let run: any = await service.startWorkflow(actor, workflow.id, { context: {}, versionId: first.id });
    assert.equal(run.versionId, first.id);
    assert.equal(run.trialRun, true);
    checks.push('run-exact-saved-draft-version');
    for (let i = 0; i < 6; i++) run = await service.executeRun(actor, run.id, {});
    assert.equal(run.status, 'completed');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].prompt, '海报\n红色');
    assert.equal(calls[0].parameters.negativePrompt, '水印');
    assert.equal(run.context.nodeResults.save.kind, 'saved_asset');
    checks.push('parallel-positive-negative-merge-generate-save');
    const publicActor = { ...actor, id: `${id}-other`, roles: ['teacher'] };
    await assert.rejects(service.startWorkflow(publicActor, workflow.id, { context: {} }), /不存在或尚未发布/);
    checks.push('normal-start-does-not-implicitly-trial-another-authors-draft');
    await client.query('UPDATE workflow_versions SET published_at=CURRENT_TIMESTAMP WHERE id=$1', [first.id]);
    await client.query("UPDATE workflows SET status='published' WHERE id=$1", [workflow.id]);
    await client.query('INSERT INTO users(id,username,display_name) VALUES($1,$1,$1)', [publicActor.id]);
    const published: any = await service.startWorkflow(publicActor, workflow.id, { context: {} });
    assert.equal(published.versionId, first.id);
    assert.equal(published.trialRun, false);
    const explicitDraft: any = await service.startWorkflow(publicActor, workflow.id, { context: {}, versionId: second.id });
    assert.equal(explicitDraft.versionId, second.id);
    assert.equal(explicitDraft.trialRun, true);
    checks.push('teacher-normal-start-uses-published-version-explicit-trial-uses-chosen-draft');
    let stale: any = await service.startWorkflow(actor, workflow.id, { context: {}, versionId: first.id });
    while (stale.steps[stale.currentStep].id !== 'generate') stale = await service.executeRun(actor, stale.id, {});
    const originalRunJob = generation.runJob;
    generation.runJob = async (...args: any[]) => {
      await client.query(`UPDATE workflow_runs SET context_json=jsonb_set(context_json,'{executing,token}','"newer-owner"'::jsonb) WHERE id=$1`, [stale.id]);
      return originalRunJob(args[0], args[1]);
    };
    await assert.rejects(service.executeRun(actor, stale.id, {}), /其他执行更新/);
    const protectedRun: any = await service.getWorkflowRun(actor, stale.id);
    assert.equal(protectedRun.currentStep, stale.currentStep);
    assert.equal(protectedRun.context.executing.token, 'newer-owner');
    checks.push('stale-completion-cannot-overwrite-or-unlock-newer-execution');
    const recovered: any = await service.startWorkflow(actor, workflow.id, { context: {}, versionId: first.id });
    await client.query(`UPDATE workflow_runs SET context_json=jsonb_set(context_json,'{executing}',jsonb_build_object('token','old-owner','at',CURRENT_TIMESTAMP-INTERVAL '11 minutes')) WHERE id=$1`, [recovered.id]);
    const continued: any = await service.executeRun(actor, recovered.id, {});
    assert.equal(continued.currentStep, 1);
    assert.equal(continued.context.executing, undefined);
    checks.push('recovery-clears-stale-execution-lock');
    const report = { checks, passed: checks.length, database: 'localhost', model: 'isolated stub; no provider requests', transaction: 'rolled back' };
    await mkdir('local-artifacts/workflow-repair-20261018', { recursive: true });
    await writeFile('local-artifacts/workflow-repair-20261018/db-results.json', JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report));
  } finally { await client.query('ROLLBACK'); await client.end(); }
}
void main().catch(error => { console.error(error.message || error.code || error.errors?.map((item: any) => item.code).join(',') || 'Database connection failed'); process.exitCode = 1; });
