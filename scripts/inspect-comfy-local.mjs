// Read-only installation inventory; never imports Python or runs custom nodes.
import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { CORE_NODES, COMFY_NODE_GROUPS } from '../shared/comfyNodes.mjs';
const root = path.resolve(process.argv[2] || 'D:/ComfyUIV9.5/ComfyUI-V9.5');
const exists = async file => stat(file).then(() => true, () => false);
const source = await readFile(path.join(root, 'nodes.py'), 'utf8');
const mapping = source.match(/NODE_CLASS_MAPPINGS\s*=\s*\{([\s\S]*?)\n\}/)?.[1] || '';
const base = [...mapping.matchAll(/"([^"]+)"\s*:/g)].map(m => m[1]);
const models = {};
async function files(dir, prefix = '') {
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    const result = [];
    for (const entry of entries) {
        if (entry.isSymbolicLink()) continue;
        if (entry.isDirectory()) result.push(...await files(path.join(dir, entry.name), `${prefix}${entry.name}/`));
        else if (/\.(safetensors|ckpt|pt|pth|bin|gguf)$/i.test(entry.name)) result.push(`${prefix}${entry.name}`);
    }
    return result;
}
for (const name of ['checkpoints', 'diffusion_models', 'text_encoders', 'clip', 'vae', 'loras', 'controlnet', 'upscale_models', 'clip_vision', 'style_models']) models[name] = await files(path.join(root, 'models', name));
let live;
try {
    const response = await fetch('http://127.0.0.1:8188/object_info', { signal: AbortSignal.timeout(4000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const info = await response.json();
    live = { reachable: true, nodeCount: Object.keys(info).length, supportedNodes: CORE_NODES.filter(n => info[n]) };
} catch (error) { live = { reachable: false, error: error.message }; }
const report = { checkedAt: new Date().toISOString(), root, mainPresent: await exists(path.join(root, 'main.py')), extrasPresent: await exists(path.join(root, 'comfy_extras')), customNodesPresent: await exists(path.join(root, 'custom_nodes')), live, supportedCount: CORE_NODES.length,
    groups: Object.fromEntries(Object.entries(COMFY_NODE_GROUPS).map(([name, nodes]) => [name, nodes.map(node => ({ node, sourceConfirmed: base.includes(node), liveConfirmed: live.reachable ? live.supportedNodes.includes(node) : null }))])), models };
const output = path.resolve(process.argv[3] || 'local-artifacts/comfy-local-inventory.json');
await writeFile(output, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ output, mainPresent: report.mainPresent, extrasPresent: report.extrasPresent, live: report.live, supportedCount: report.supportedCount, sourceConfirmed: CORE_NODES.filter(n => base.includes(n)).length, models: Object.fromEntries(Object.entries(models).map(([name, list]) => [name, list.length])) }, null, 2));
