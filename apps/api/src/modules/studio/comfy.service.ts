import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import type { MultipartFile } from '@fastify/multipart';
import { DatabaseService } from '../database/database.service';
import type { Actor } from '../auth/auth.service';
import { getEnvironment } from '../../common/environment';
import { storePrivateUpload } from './private-upload';
import { validatePrompt, compileGraph } from './comfy-contracts';
@Injectable()
export class ComfyService {
    constructor(private readonly db: DatabaseService) { }
    async catalog(actor: Actor) { const r = await this.db.query(`SELECT r.device_id,r.nodes_json FROM comfy_worker_registry r JOIN local_bridge_devices d ON d.id=r.device_id WHERE d.user_id=$1 AND d.status='active' AND d.expires_at>CURRENT_TIMESTAMP AND d.last_seen_at>CURRENT_TIMESTAMP-INTERVAL '45 seconds' ORDER BY r.updated_at DESC`, [actor.id]); return { nodes: r.rows[0]?.nodes_json ?? {}, workers: r.rows.map(x => ({ id: x.device_id, nodeCount: Object.keys(x.nodes_json).length })) }; }
    async register(device: {
        id: string;
        user_id: string;
    }, nodes: Record<string, any>) { await this.db.query(`INSERT INTO comfy_worker_registry(device_id,nodes_json) VALUES($1,$2::jsonb) ON CONFLICT(device_id) DO UPDATE SET nodes_json=EXCLUDED.nodes_json,updated_at=CURRENT_TIMESTAMP`, [device.id, JSON.stringify(nodes)]); return { ok: true }; }
    async validateGraph(actor: Actor, definition: {
        nodes: Array<Record<string, any>>;
        edges: Array<Record<string, any>>;
    }) {
        const c = await this.catalog(actor);
        if (!c.workers.length)
            throw new ConflictException('没有在线且已配对的 GPU Worker');
        return compileGraph(definition, c.nodes);
    }
    async validate(actor: Actor, prompt: Record<string, any>) {
        const c = await this.catalog(actor);
        if (!c.workers.length)
            throw new ConflictException('没有在线且已配对的 GPU Worker');
        validatePrompt(prompt, c.nodes);
        return c;
    }
    async enqueue(actor: Actor, runId: string, prompt: Record<string, any>) {
        await this.validate(actor, prompt);
        await this.db.transaction(async (c) => {
            await c.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [actor.id]);
            const count = await c.query("SELECT count(*)::int AS count FROM comfy_jobs WHERE user_id=$1 AND status IN ('queued','running','cancelling')", [actor.id]);
            if (count.rows[0].count >= 10)
                throw new ConflictException('每个账号最多 10 个未完成 GPU 任务');
            await c.query(`INSERT INTO comfy_jobs(run_id,user_id,prompt_json) VALUES($1,$2,$3::jsonb)`, [runId, actor.id, JSON.stringify(prompt)]);
        });
    }
    async expire() {
        await this.db.transaction(async (c) => {
            const r = await c.query(`UPDATE comfy_jobs SET status=CASE WHEN status='cancelling' THEN 'cancelled' ELSE 'failed' END,error='Worker 失去心跳；请检查本机队列后手动重试',updated_at=CURRENT_TIMESTAMP WHERE status IN ('running','cancelling') AND lease_until<CURRENT_TIMESTAMP RETURNING run_id`);
            for (const row of r.rows)
                await c.query(`UPDATE workflow_runs SET status='cancelled',updated_at=CURRENT_TIMESTAMP WHERE id=$1`, [row.run_id]);
        });
    }
    async queue(actor: Actor) { await this.expire(); const r = await this.db.query(`SELECT j.run_id,j.status,j.error,j.progress_json,j.created_at,w.name,w.id AS workflow_id FROM comfy_jobs j JOIN workflow_runs r ON r.id=j.run_id JOIN workflows w ON w.id=r.workflow_id WHERE j.user_id=$1 ORDER BY j.created_at DESC LIMIT 50`, [actor.id]); return { items: r.rows.map(j => ({ runId: j.run_id, workflowId: j.workflow_id, workflowName: j.name, status: j.status, error: j.error, progress: j.progress_json })) }; }
    async job(actor: Actor, runId: string) {
        await this.expire();
        const r = await this.db.query(`SELECT * FROM comfy_jobs WHERE run_id=$1 AND user_id=$2`, [runId, actor.id]);
        if (!r.rows[0])
            throw new NotFoundException('ComfyUI 任务不存在');
        const a = await this.db.query(`SELECT id,file_name,is_preview,sha256 FROM comfy_artifacts WHERE run_id=$1`, [runId]);
        return { runId, status: r.rows[0].status, error: r.rows[0].error, progress: r.rows[0].progress_json, previewUrl: a.rows.find(x => x.is_preview) ? `/api/comfy/artifacts/${encodeURIComponent(a.rows.find(x => x.is_preview)!.id)}?v=${a.rows.find(x => x.is_preview)!.sha256}` : null, artifacts: a.rows.filter(x => !x.is_preview).map(x => ({ id: x.id, fileName: x.file_name, downloadUrl: `/api/comfy/artifacts/${encodeURIComponent(x.id)}` })) };
    }
    async cancel(actor: Actor, runId: string) {
        await this.db.transaction(async (c) => {
            const r = await c.query(`UPDATE comfy_jobs SET status=CASE WHEN status='queued' THEN 'cancelled' ELSE 'cancelling' END,updated_at=CURRENT_TIMESTAMP WHERE run_id=$1 AND user_id=$2 AND status IN ('queued','running') RETURNING status`, [runId, actor.id]);
            if (!r.rows[0])
                throw new ConflictException('任务已结束或正在取消');
            if (r.rows[0].status === 'cancelled')
                await c.query(`UPDATE workflow_runs SET status='cancelled',updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND user_id=$2`, [runId, actor.id]);
        });
        return this.job(actor, runId);
    }
    async retry(actor: Actor, runId: string) {
        const previous = await this.db.query(`SELECT j.prompt_json,j.status,r.workflow_id,r.workflow_version_id,r.total_steps,r.context_json
          FROM comfy_jobs j JOIN workflow_runs r ON r.id=j.run_id JOIN workflows w ON w.id=r.workflow_id
          JOIN workflow_versions v ON v.id=r.workflow_version_id
          WHERE j.run_id=$1 AND j.user_id=$2 AND w.status<>'archived'
            AND (v.published_at IS NOT NULL OR w.created_by=$2 OR $3::boolean)`, [runId, actor.id, actor.roles.some(role => ['admin', 'teacher', 'operator'].includes(role))]);
        const row = previous.rows[0];
        if (!row || !['failed', 'cancelled'].includes(row.status))
            throw new ConflictException('只能重试本人有权访问的失败或取消任务');
        await this.validate(actor, row.prompt_json);
        const id = `workflow-run-${randomUUID()}`;
        await this.db.transaction(async (c) => {
            await c.query(`INSERT INTO workflow_runs(id,user_id,workflow_id,workflow_version_id,total_steps,context_json)
            VALUES($1,$2,$3,$4,$5,$6::jsonb)`, [id, actor.id, row.workflow_id, row.workflow_version_id, row.total_steps, JSON.stringify({ ...row.context_json, retryOf: runId })]);
            await c.query(`INSERT INTO workflow_run_events(id,run_id,step_index,event_type) VALUES($1,$2,0,'start')`, [`workflow-event-${randomUUID()}`, id]);
        });
        try {
            await this.enqueue(actor, id, row.prompt_json);
        }
        catch (error) {
            await this.db.query("UPDATE workflow_runs SET status='cancelled' WHERE id=$1", [id]);
            throw error;
        }
        return { id };
    }
    async claim(device: {
        id: string;
        user_id: string;
    }) {
        await this.expire();
        return this.db.transaction(async (c) => {
            await c.query('SELECT id FROM local_bridge_devices WHERE id=$1 FOR UPDATE', [device.id]);
            if ((await c.query(`SELECT 1 FROM comfy_jobs WHERE device_id=$1 AND status IN ('running','cancelling')`, [device.id])).rowCount)
                return null;
            const r = await c.query(`SELECT j.* FROM comfy_jobs j WHERE j.user_id=$1 AND j.status='queued' ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 10`, [device.user_id]);
            if (!r.rows[0])
                return null;
            const registry = await c.query(`SELECT nodes_json FROM comfy_worker_registry WHERE device_id=$1`, [device.id]);
            if (!registry.rows[0])
                throw new ConflictException('Worker 未上报节点');
            const candidate = r.rows.find(row => {
                try {
                    validatePrompt(row.prompt_json, registry.rows[0].nodes_json);
                    return true;
                }
                catch {
                    return false;
                }
            });
            if (!candidate)
                return null;
            await c.query(`UPDATE comfy_jobs SET status='running',device_id=$2,lease_until=CURRENT_TIMESTAMP+INTERVAL '45 seconds',updated_at=CURRENT_TIMESTAMP WHERE run_id=$1`, [candidate.run_id, device.id]);
            return { runId: candidate.run_id, prompt: candidate.prompt_json };
        });
    }
    async pulse(device: {
        id: string;
        user_id: string;
    }, runId: string, progress?: Record<string, any>) {
        const r = await this.db.query(`UPDATE comfy_jobs SET lease_until=CURRENT_TIMESTAMP+INTERVAL '45 seconds',progress_json=progress_json||COALESCE($4::jsonb,'{}'::jsonb),updated_at=CURRENT_TIMESTAMP WHERE run_id=$1 AND device_id=$2 AND user_id=$3 AND status IN ('running','cancelling') RETURNING status`, [runId, device.id, device.user_id, progress ? JSON.stringify(progress) : null]);
        if (!r.rows[0])
            throw new ConflictException('任务租约已结束或不属于该设备');
        return { cancel: r.rows[0].status === 'cancelling' };
    }
    async finish(device: {
        id: string;
        user_id: string;
    }, runId: string, input: {
        status: string;
        error?: string;
    }) {
        await this.db.transaction(async (c) => {
            const r = await c.query(`SELECT status FROM comfy_jobs WHERE run_id=$1 AND device_id=$2 AND user_id=$3 FOR UPDATE`, [runId, device.id, device.user_id]);
            if (!r.rows[0] || !['running', 'cancelling'].includes(r.rows[0].status))
                throw new ConflictException('任务租约已结束');
            const status = r.rows[0].status === 'cancelling' ? 'cancelled' : input.status;
            await c.query(`UPDATE comfy_jobs SET status=$2,error=$3,lease_until=NULL,updated_at=CURRENT_TIMESTAMP WHERE run_id=$1`, [runId, status, input.error ?? null]);
            await c.query(`UPDATE workflow_runs SET status=$2,current_step=CASE WHEN $2='completed' THEN total_steps ELSE current_step END,completed_at=CASE WHEN $2='completed' THEN CURRENT_TIMESTAMP ELSE NULL END,updated_at=CURRENT_TIMESTAMP WHERE id=$1`, [runId, status === 'completed' ? 'completed' : 'cancelled']);
        });
        return { ok: true };
    }
    async upload(device: {
        id: string;
        user_id: string;
    }, runId: string, part: MultipartFile, preview = false) {
        await this.pulse(device, runId);
        if (!getEnvironment().fileUploadsEnabled)
            throw new ConflictException('服务器未启用受控文件上传');
        const upload = await storePrivateUpload(part, getEnvironment().uploadRoot, ['image/png', 'image/jpeg', 'image/webp'], `comfy/${randomUUID()}`);
        const id = preview ? `comfy-preview-${runId}` : `comfy-asset-${randomUUID()}`;
        const previous = preview ? (await this.db.query('SELECT storage_key FROM comfy_artifacts WHERE id=$1', [id])).rows[0] : null;
        try {
            const r = await this.db.query(`INSERT INTO comfy_artifacts(id,run_id,storage_key,file_name,mime_type,size_bytes,sha256,is_preview) SELECT $1,run_id,$3,$4,$5,$6,$7,$10 FROM comfy_jobs WHERE run_id=$2 AND device_id=$8 AND user_id=$9 AND status='running' AND ($10 OR (SELECT count(*) FROM comfy_artifacts WHERE run_id=$2 AND NOT is_preview)<16) ON CONFLICT(id) DO UPDATE SET storage_key=EXCLUDED.storage_key,file_name=EXCLUDED.file_name,mime_type=EXCLUDED.mime_type,size_bytes=EXCLUDED.size_bytes,sha256=EXCLUDED.sha256 RETURNING id`, [id, runId, upload.storageKey, upload.fileName, upload.mimeType, upload.sizeBytes, upload.sha256, device.id, device.user_id, preview]);
            if (!r.rowCount)
                throw new ConflictException('任务已取消或输出数量超过 16');
            if (previous)
                await rm(path.resolve(getEnvironment().uploadRoot, previous.storage_key), { force: true }).catch(() => { });
            return { id };
        }
        catch (e) {
            await rm(path.resolve(getEnvironment().uploadRoot, upload.storageKey), { force: true });
            throw e;
        }
    }
    async asset(actor: Actor, id: string) {
        const r = await this.db.query(`SELECT a.* FROM comfy_artifacts a JOIN comfy_jobs j ON j.run_id=a.run_id WHERE a.id=$1 AND j.user_id=$2`, [id, actor.id]);
        if (!r.rows[0])
            throw new NotFoundException('产物不存在');
        const a = r.rows[0];
        return { mimeType: a.mime_type, stream: createReadStream(path.resolve(getEnvironment().uploadRoot, a.storage_key)) };
    }
}
