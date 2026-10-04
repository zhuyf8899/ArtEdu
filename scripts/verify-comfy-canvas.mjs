// Browser QA with intercepted platform fixtures and real ComfyUI node metadata.
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { importComfy } from '../admin-console/src/comfyGraph.js';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(process.env.ARTEDU_PLAYWRIGHT_ROOT || root, 'package.json'));
const { chromium } = require('playwright');
const dist = process.env.ARTEDU_QA_DIST;
const output = process.env.ARTEDU_QA_OUTPUT;
if (!dist || !output)
    throw new Error('Specify QA_DIST and QA_OUTPUT');
await mkdir(output, { recursive: true });
const info = await fetch('http://127.0.0.1:8188/object_info').then(r => r.json());
const catalog = Object.fromEntries(['CheckpointLoaderSimple', 'CLIPTextEncode', 'EmptyLatentImage', 'KSampler', 'VAEDecode', 'SaveImage', 'PreviewImage'].map(name => [name, info[name]]));
const history = await fetch('http://127.0.0.1:8188/history').then(r => r.json());
const record = Object.values(history).find(h => h.status?.status_str === 'success');
assert(record, 'Run GPU QA first');
const definition = importComfy(record.prompt[2], catalog);
const workflow = { id: 'qa-native', name: 'ComfyUI 真实节点验收', description: 'GPU workflow fixture', category: 'GPU', entryType: 'workbench', status: 'published', createdBy: 'qa', creatorName: 'QA', versionNumber: 1, stepCount: 7, versions: [{ id: 'v1', definition, published: true, versionNumber: 1 }], definition };
const server = createServer(async (req, res) => {
    try {
        const target = new URL(req.url, 'http://localhost').pathname;
        const rel = decodeURIComponent(target).replace(/^\//, '');
        let file = path.resolve(dist, rel || 'index.html');
        if (!file.startsWith(path.resolve(dist) + path.sep))
            throw new Error('invalid');
        let bytes;
        try {
            bytes = await readFile(file);
        }
        catch {
            file = path.join(dist, 'index.html');
            bytes = await readFile(file);
        }
        res.setHeader('content-type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.html') ? 'text/html' : 'application/octet-stream');
        res.end(bytes);
    }
    catch {
        res.writeHead(404);
        res.end();
    }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ headless: true, executablePath: process.env.ARTEDU_BROWSER_PATH });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const p = url.pathname;
    let body = { items: [] };
    if (p === '/api/auth/me')
        body = { id: 'qa', displayName: 'QA', roles: ['admin'] };
    else if (p === '/api/admin/workflows')
        body = { items: [workflow] };
    else if (p === '/api/admin/workflows/qa-native')
        body = workflow;
    else if (p === '/api/comfy/catalog')
        body = { nodes: catalog, workers: [{ id: 'qa-worker' }] };
    else if (p === '/api/admin/dashboard')
        body = {};
    else if (p === '/api/health')
        body = { status: 'ok' };
    await route.fulfill({ json: body });
});
try {
    await page.goto(`http://127.0.0.1:${server.address().port}/admin/workflows`);
    await page.getByRole('button', { name: /ComfyUI 真实节点验收/ }).click();
    await page.waitForSelector('.comfy-node');
    assert.equal(await page.locator('.comfy-node').count(), 7);
    assert(await page.locator('.react-flow__handle').count() > 20);
    const sampler = page.locator('.comfy-node').filter({ has: page.locator('small', { hasText: /^KSampler$/ }) });
    const seed = sampler.locator('label').filter({ hasText: /^seed$/ }).locator('input');
    const before = await seed.inputValue();
    await seed.fill('42');
    await page.getByRole('button', { name: '＋ 添加节点', exact: true }).click();
    await page.getByRole('button', { name: '撤销', exact: true }).click();
    assert.equal(await seed.inputValue(), before);
    await page.getByRole('button', { name: '重做', exact: true }).click();
    assert.equal(await seed.inputValue(), '42');
    const bounds = await page.locator('.comfy-editor').boundingBox();
    assert.equal(bounds.x, 0);
    assert.equal(bounds.y, 0);
    assert.equal(bounds.width, 1440);
    await page.screenshot({ path: path.join(output, 'canvas-desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: path.join(output, 'canvas-mobile.png'), fullPage: true });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    assert.deepEqual(errors, []);
    await writeFile(path.join(output, 'browser-report.json'), JSON.stringify({ nodes: 7, typedHandles: await page.locator('.react-flow__handle').count(), undoRedo: true, viewportWidths: [1440, 390], errors }, null, 2));
    console.log('Browser QA passed: typed nodes, seed editing, undo/redo, desktop/mobile, no runtime errors');
}
finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
}
