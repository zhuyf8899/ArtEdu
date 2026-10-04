// GPU integration QA. The platform transport is a local fixture, never a real account.
// ComfyUI executes the actual checkpoint on the GPU. Outputs stay in ARTEDU_QA_OUTPUT.
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const apiRequire = createRequire(path.join(root, 'apps/api/package.json'));
apiRequire('ts-node').register({ project: path.join(root, 'apps/api/tsconfig.json') });
const { registrySchema, validatePrompt } = apiRequire('./src/modules/studio/comfy-contracts.ts');
const output = process.env.ARTEDU_QA_OUTPUT || path.resolve(root, 'qa-comfy-worker');
await mkdir(output, { recursive: true });
const comfy = process.env.COMFYUI_BASE_URL || 'http://127.0.0.1:8188';
const metadata = await fetch(`${comfy}/object_info`).then(r => r.json());
const checkpoint = process.env.COMFYUI_QA_CHECKPOINT || metadata.CheckpointLoaderSimple.input.required.ckpt_name[0][0];
if (!checkpoint)
    throw new Error('没有可用 checkpoint');
const seed = Number(process.env.COMFYUI_QA_SEED || Date.now() % 2147483647);
const prompt = (steps) => ({
    '1': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: checkpoint } },
    '2': { class_type: 'CLIPTextEncode', inputs: { text: 'a watercolor blue flower, white background', clip: ['1', 1] } },
    '3': { class_type: 'CLIPTextEncode', inputs: { text: 'text, watermark, blurry', clip: ['1', 1] } },
    '4': { class_type: 'EmptyLatentImage', inputs: { width: 256, height: 256, batch_size: 1 } },
    '5': { class_type: 'KSampler', inputs: { seed, steps, cfg: 7, sampler_name: 'euler', scheduler: 'normal', denoise: 1, model: ['1', 0], positive: ['2', 0], negative: ['3', 0], latent_image: ['4', 0] } },
    '6': { class_type: 'VAEDecode', inputs: { samples: ['5', 0], vae: ['1', 2] } },
    '7': { class_type: 'SaveImage', inputs: { images: ['6', 0], filename_prefix: 'ArtEdu_QA' } }
});
const token = randomBytes(32).toString('base64url');
let registered = false;
let active = null;
const pending = [{ runId: 'qa-generate', prompt: prompt(5) }, { runId: 'qa-cancel', prompt: prompt(100) }];
const results = [];
let progressCount = 0;
let artifactCount = 0;
let previewCount = 0;
let doneResolve;
const done = new Promise(resolve => doneResolve = resolve);
const server = createServer(async (req, res) => {
    try {
        assert.equal(req.headers.authorization, `Bearer ${token}`);
        const parts = [];
        for await (const chunk of req)
            parts.push(chunk);
        const bytes = Buffer.concat(parts);
        const route = req.url.replace('/api/local-bridge/comfy/', '');
        let body = {};
        if (req.headers['content-type']?.includes('application/json'))
            body = JSON.parse(bytes.toString());
        let result = { ok: true };
        if (route === 'register') {
            const parsed = registrySchema.parse(body);
            assert(parsed.nodes.KSampler);
            pending.forEach(task => validatePrompt(task.prompt, parsed.nodes));
            registered = true;
        }
        else if (route === 'claim') {
            result = active ? null : (active = pending.shift() || null);
        }
        else if (route.endsWith('/pulse')) {
            result = { cancel: active?.runId === 'qa-cancel' };
        }
        else if (route.endsWith('/progress')) {
            assert(['executing', 'progress', 'execution_cached', 'execution_error', 'executed', 'status'].includes(body.type));
            progressCount++;
        }
        else if (route.endsWith('/artifacts')) {
            assert(bytes.includes(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])));
            artifactCount++;
            await writeFile(path.join(output, `artifact-${artifactCount}.multipart`), bytes);
        }
        else if (route.endsWith('/preview')) {
            previewCount++;
        }
        else if (route.endsWith('/finish')) {
            results.push({ runId: active.runId, ...body });
            active = null;
            if (results.length === 2)
                doneResolve();
        }
        else
            throw new Error(`Unexpected route ${route}`);
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(result));
    }
    catch (e) {
        res.writeHead(400, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ message: e.message }));
    }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const worker = spawn(process.execPath, [path.join(root, 'services/local-bridge/comfy-worker.mjs')], { env: { ...process.env, ARTEDU_API_URL: `http://127.0.0.1:${server.address().port}/api/`, ARTEDU_BRIDGE_TOKEN: token, COMFYUI_BASE_URL: comfy, COMFYUI_DEDICATED: 'true' }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
let log = '';
worker.stdout.on('data', chunk => { log += chunk.toString(); });
worker.stderr.on('data', chunk => { log += chunk.toString(); });
let timeout;
try {
    await Promise.race([done, new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('GPU QA 超时')), 240000); })]);
    assert(registered);
    assert.equal(results[0].status, 'completed', log);
    assert.equal(results[1].status, 'cancelled', log);
    assert(artifactCount > 0);
    assert(progressCount > 0);
    assert(previewCount > 0, '实时采样预览未收到');
    const report = { seed, checkpoint, results, artifactCount, previewCount, progressCount, transport: 'local fixture; real ComfyUI GPU execution' };
    await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
}
finally {
    clearTimeout(timeout);
    worker.kill();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await writeFile(path.join(output, 'worker.log'), log);
}
