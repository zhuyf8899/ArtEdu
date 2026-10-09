// Outbound-only GPU worker. Run against a dedicated, loopback ComfyUI instance.
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
export const CORE_NODES = ['CheckpointLoaderSimple', 'CLIPTextEncode', 'EmptyLatentImage', 'KSampler', 'VAEDecode', 'SaveImage', 'PreviewImage', 'LoadImage', 'LoraLoader', 'ControlNetLoader', 'ControlNetApplyAdvanced', 'UpscaleModelLoader', 'ImageUpscaleWithModel'];
export function endpoint(raw) {
    const u = new URL(raw);
    if (!['http:', 'https:'].includes(u.protocol) || !['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname) || u.username || u.password || u.pathname !== '/')
        throw new Error('ComfyUI 必须使用无凭据的本机回环地址');
    return u;
}
export function filterCatalog(catalog, allow) { return Object.fromEntries(Object.entries(catalog).filter(([name]) => allow.has(name))); }
export async function runWorker() {
    const base = endpoint(process.env.COMFYUI_BASE_URL || 'http://127.0.0.1:8188');
    const api = new URL(process.env.ARTEDU_API_URL || 'http://localhost:4000/api/');
    if (!api.pathname.endsWith('/'))
        api.pathname += '/';
    if (!['http:', 'https:'].includes(api.protocol) || api.username || api.password || api.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(api.hostname))
        throw new Error('平台地址需为 HTTPS 或本机隧道');
    const token = process.env.ARTEDU_BRIDGE_TOKEN;
    if (!token)
        throw new Error('请配置本地 Bridge 令牌');
    if (process.env.COMFYUI_DEDICATED !== 'true')
        throw new Error('请使用独立 ComfyUI 实例并设置 COMFYUI_DEDICATED=true；interrupt 是实例级操作');
    const allow = new Set([...CORE_NODES, ...(process.env.COMFYUI_ALLOWED_NODES || '').split(',').map(x => x.trim()).filter(Boolean)]);
    const apiCall = async (route, body) => {
        const multipart = body instanceof FormData;
        const r = await fetch(new URL(`local-bridge/comfy/${route}`, api), { method: 'POST', headers: { authorization: `Bearer ${token}`, ...(!multipart ? { 'content-type': 'application/json' } : {}) }, body: multipart ? body : JSON.stringify(body || {}), signal: AbortSignal.timeout(15000), redirect: 'error' });
        const data = await r.json();
        if (!r.ok)
            throw new Error(data.message || `平台 ${r.status}`);
        return data;
    };
    const comfy = async (route, body) => {
        const r = await fetch(new URL(route, base), { method: body === undefined ? 'GET' : 'POST', headers: body === undefined ? {} : { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15000), redirect: 'error' });
        const text = await r.text();
        const data = text ? JSON.parse(text) : {};
        if (!r.ok || data.error)
            throw new Error(JSON.stringify(data.error || data).slice(0, 1200));
        return data;
    };
    let lastRegistry = 0;
    while (true) {
        try {
            if (Date.now() - lastRegistry > 30000) {
                const nodes = filterCatalog(await comfy('/object_info'), allow);
                const sanitized = Object.fromEntries(Object.entries(nodes).map(([name, n]) => [name, { input: n.input, output: n.output, output_name: n.output_name, output_node: n.output_node, display_name: n.display_name, category: n.category }]));
                await apiCall('register', { nodes: sanitized });
                lastRegistry = Date.now();
            }
            const task = await apiCall('claim');
            if (!task?.runId) {
                await pause(1200);
                continue;
            }
            let promptId;
            let aborted = false;
            let ws;
            let eventChain = Promise.resolve();
            let failure = '';
            try {
                if (Object.values(task.prompt).some(n => !allow.has(n.class_type)))
                    throw new Error('包含未经本机审核的节点');
                const clientId = randomUUID();
                const wsUrl = new URL('/ws', base);
                wsUrl.protocol = base.protocol === 'https:' ? 'wss:' : 'ws:';
                wsUrl.searchParams.set('clientId', clientId);
                ws = new WebSocket(wsUrl);
                ws.binaryType = 'arraybuffer';
                let lastPreview = 0;
                await new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error('ComfyUI WebSocket 连接超时')), 10000); ws.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true }); ws.addEventListener('error', () => { clearTimeout(timer); reject(new Error('ComfyUI WebSocket 不可用')); }, { once: true }); });
                ws.addEventListener('message', event => {
                    if (event.data instanceof ArrayBuffer) {
                        const data = new Uint8Array(event.data);
                        if (promptId && data.byteLength > 8 && data.byteLength <= 10 * 1024 * 1024 && Date.now() - lastPreview > 2000) {
                            const view = new DataView(event.data);
                            if (view.getUint32(0) === 1 && [1, 2].includes(view.getUint32(4))) {
                                lastPreview = Date.now();
                                const type = view.getUint32(4) === 1 ? 'image/jpeg' : 'image/png';
                                const form = new FormData();
                                form.append('file', new Blob([data.slice(8)], { type }), 'preview.' + (type === 'image/jpeg' ? 'jpg' : 'png'));
                                eventChain = eventChain.then(() => apiCall(`jobs/${encodeURIComponent(task.runId)}/preview`, form)).catch(() => { });
                            }
                        }
                        return;
                    }
                    if (typeof event.data !== 'string')
                        return;
                    let m;
                    try {
                        m = JSON.parse(event.data);
                    }
                    catch {
                        return;
                    }
                    if (m.data?.prompt_id && promptId && m.data.prompt_id !== promptId)
                        return;
                    if (!['executing', 'progress', 'execution_cached', 'execution_error', 'executed', 'status'].includes(m.type))
                        return;
                    const data = { type: m.type };
                    if (m.data?.node !== undefined)
                        data.node = m.data.node === null ? null : String(m.data.node);
                    if (m.type === 'progress') {
                        data.value = m.data.value;
                        data.max = m.data.max;
                    }
                    if (m.type === 'execution_cached')
                        data.cached = (m.data.nodes || []).map(String);
                    if (m.type === 'execution_error')
                        failure = String(m.data.exception_message || 'ComfyUI 执行失败').slice(0, 1200);
                    eventChain = eventChain.then(() => apiCall(`jobs/${encodeURIComponent(task.runId)}/progress`, data)).catch(() => { });
                });
                const submitted = await comfy('/prompt', { prompt: task.prompt, client_id: clientId, extra_data: { preview_method: 'auto' } });
                promptId = submitted.prompt_id;
                if (!promptId)
                    throw new Error('ComfyUI 未返回 prompt_id');
                const started = Date.now();
                let record;
                while (!record) {
                    const state = await apiCall(`jobs/${encodeURIComponent(task.runId)}/pulse`);
                    if (state.cancel) {
                        await comfy('/queue', { delete: [promptId] });
                        const q = await comfy('/queue');
                        if ((q.queue_running || []).some(x => x[1] === promptId))
                            await comfy('/interrupt', { prompt_id: promptId });
                        aborted = true;
                        break;
                    }
                    if (failure)
                        throw new Error(failure);
                    if (Date.now() - started > Number(process.env.COMFYUI_JOB_TIMEOUT_MS || 1800000))
                        throw new Error('GPU 工作流超时');
                    record = (await comfy(`/history/${encodeURIComponent(promptId)}`))[promptId];
                    if (!record)
                        await pause(1000);
                }
                if (record?.status?.status_str === 'error')
                    throw new Error(JSON.stringify(record.status.messages).slice(0, 1200));
                if (!aborted) {
                    for (const result of Object.values(record?.outputs || {})) {
                        for (const image of result.images || []) {
                            const params = new URLSearchParams({ filename: image.filename, subfolder: image.subfolder || '', type: image.type || 'output' });
                            const response = await fetch(new URL(`/view?${params}`, base), { signal: AbortSignal.timeout(15000), redirect: 'error' });
                            if (!response.ok)
                                throw new Error('ComfyUI 产物读取失败');
                            const contentLength = Number(response.headers.get('content-length') || 0);
                            if (contentLength > 10 * 1024 * 1024)
                                throw new Error('产物超过 10 MiB');
                            const reader = response.body.getReader();
                            const chunks = [];
                            let bytes = 0;
                            for (;;) {
                                const { done, value } = await reader.read();
                                if (done)
                                    break;
                                bytes += value.length;
                                if (bytes > 10 * 1024 * 1024) {
                                    await reader.cancel();
                                    throw new Error('产物超过 10 MiB');
                                }
                                chunks.push(value);
                            }
                            const form = new FormData();
                            form.append('file', new Blob(chunks, { type: response.headers.get('content-type') || 'image/png' }), image.filename.split(/[\\/]/).pop());
                            await apiCall(`jobs/${encodeURIComponent(task.runId)}/artifacts`, form);
                        }
                    }
                }
                await eventChain;
                await apiCall(`jobs/${encodeURIComponent(task.runId)}/finish`, { status: aborted ? 'cancelled' : 'completed' });
            }
            catch (error) {
                if (promptId) {
                    await comfy('/queue', { delete: [promptId] }).catch(() => { });
                    const q = await comfy('/queue').catch(() => ({}));
                    if ((q.queue_running || []).some(x => x[1] === promptId))
                        await comfy('/interrupt', { prompt_id: promptId }).catch(() => { });
                }
                await apiCall(`jobs/${encodeURIComponent(task.runId)}/finish`, { status: 'failed', error: String(error.message).slice(0, 1200) }).catch(() => { });
                console.error('任务失败：', error.message);
            }
            finally {
                ws?.close();
            }
        }
        catch (error) {
            console.error('Worker：', error.message);
            await pause(3000);
        }
    }
}
function pause(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
    runWorker().catch(e => { console.error(e.message); process.exitCode = 1; });
