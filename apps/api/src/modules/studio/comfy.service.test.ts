import test from 'node:test';
import assert from 'node:assert/strict';
import { ComfyService } from './comfy.service';
const actor = { id: 'owner', username: 'owner', displayName: 'Owner', accountStatus: 'active', roles: ['student'] } as const;
function database(query: (sql: string, values?: any[]) => Promise<any>) { return { query, transaction: async (fn: any) => fn({ query }) } as any; }
test('A different user cannot inspect a ComfyUI job or download its artifact', async () => {
    const seen: any[] = [];
    const query = async (sql: string, values: any[] = []) => { seen.push({ sql, values }); return { rows: [], rowCount: 0 }; };
    const s = new ComfyService(database(query));
    await assert.rejects(() => s.job({ ...actor, roles: [...actor.roles] } as any, 'other-job'), /不存在/);
    await assert.rejects(() => s.asset({ ...actor, roles: [...actor.roles] } as any, 'other-asset'), /不存在/);
    assert(seen.filter(x => x.sql.includes('comfy_jobs WHERE run_id')).every(x => x.values[1] === 'owner'));
    assert(seen.find(x => x.sql.includes('WHERE a.id')).values[1] === 'owner');
});
test('Cancel requests win over a late successful Worker response', async () => {
    const seen: any[] = [];
    const query = async (sql: string, values: any[] = []) => { seen.push({ sql, values }); return sql.startsWith('SELECT status') ? { rows: [{ status: 'cancelling' }], rowCount: 1 } : { rows: [], rowCount: 1 }; };
    const s = new ComfyService(database(query));
    await s.finish({ id: 'device', user_id: 'owner' }, 'run', { status: 'completed' });
    assert.equal(seen.find(x => x.sql.startsWith('UPDATE comfy_jobs')).values[1], 'cancelled');
    assert.equal(seen.find(x => x.sql.startsWith('UPDATE workflow_runs')).values[1], 'cancelled');
});
test('Stale or wrong-device completion cannot overwrite terminal jobs', async () => {
    let writes = 0;
    const query = async (sql: string, values: any[] = []) => {
        if (sql.startsWith('UPDATE'))
            writes++;
        if (sql.startsWith('SELECT status')) {
            assert.deepEqual(values, ['run', 'other-device', 'owner']);
            return { rows: [], rowCount: 0 };
        }
        return { rows: [], rowCount: 0 };
    };
    await assert.rejects(() => new ComfyService(database(query)).finish({ id: 'other-device', user_id: 'owner' }, 'run', { status: 'completed' }), /租约已结束/);
    assert.equal(writes, 0);
});
test('Worker polling is device and owner scoped and reports cancellation', async () => {
    const query = async (sql: string, values: any[] = []) => { assert(sql.includes('device_id=$2 AND user_id=$3')); assert.deepEqual(values.slice(0, 3), ['run', 'device', 'owner']); return { rows: [{ status: 'cancelling' }], rowCount: 1 }; };
    const result = await new ComfyService(database(query)).pulse({ id: 'device', user_id: 'owner' }, 'run', { type: 'progress', value: 1, max: 5 });
    assert.equal(result.cancel, true);
});
test('Retry preserves the original immutable workflow version and prompt snapshot', async () => {
    const calls: any[] = [];
    const snapshot = { '1': { class_type: 'SaveImage', inputs: { filename_prefix: 'seed-7' } } };
    const query = async (sql: string, values: any[] = []) => {
        calls.push({ sql, values });
        if (sql.includes('SELECT j.prompt_json'))
            return { rows: [{ status: 'failed', prompt_json: snapshot, workflow_id: 'w', workflow_version_id: 'original-v', total_steps: 7, context_json: { engine: 'comfyui' } }], rowCount: 1 };
        return { rows: [], rowCount: 1 };
    };
    const service = new ComfyService(database(query));
    service.validate = async () => ({ nodes: {}, workers: [] });
    let enqueued: any;
    service.enqueue = async (_actor, id, prompt) => { enqueued = { id, prompt }; };
    const result = await service.retry({ ...actor, roles: [...actor.roles] } as any, 'original-run');
    assert.equal(calls.find(x => x.sql.includes('INSERT INTO workflow_runs')).values[3], 'original-v');
    assert.deepEqual(enqueued.prompt, snapshot);
    assert.equal(enqueued.id, result.id);
    assert.equal(JSON.parse(calls.find(x => x.sql.includes('INSERT INTO workflow_runs')).values[5]).retryOf, 'original-run');
});
