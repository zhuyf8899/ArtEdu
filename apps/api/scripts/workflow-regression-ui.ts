import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { StudioService } from '../src/modules/studio/studio.service';
import { workflowVersionInputSchema } from '../src/modules/studio/studio.contracts';

// Actual production frontend + StudioService, isolated SQL fixture and model.
// No external API, real account, database writes or model provider calls.
async function main() {
  const root = process.cwd();
  const require = createRequire(path.join(root, 'apps/api/package.json'));
  const puppeteer = require('puppeteer-core');
  const fresh = process.argv.includes('--new-draft');
  const expanded = process.argv.includes('--node-expansion');
  const output = path.join(root, 'local-artifacts/workflow-repair-20261018', expanded ? 'node-expansion' : fresh ? 'new-draft' : 'existing-draft');
  await mkdir(output, { recursive: true });
  const actor = { id: 'qa', username: 'qa', displayName: 'QA', roles: ['admin'], accountStatus: 'active' } as any;
  const node = (id: string, type: string, value: string, x: number, y: number) => ({ id, type, position: { x, y }, data: { label: id, value, description: `${id}说明` } });
  let definition: any = { schemaVersion: 2, nodes: [node('input', 'input', '海报', 0, 0), node('positive', 'prompt', '红色', 320, 0), node('negative', 'negative_prompt', '水印', 320, 390), node('merge', 'prompt_merge', '', 650, 0), node('generate', 'ksampler', '', 980, 0), node('save', 'save_image', '', 1300, 0)], edges: [
    { id: 'e1', source: 'input', target: 'positive', sourceHandle: 'output', targetHandle: 'input' },
    { id: 'e2', source: 'positive', target: 'merge', sourceHandle: 'output', targetHandle: 'positive' },
    { id: 'e3', source: 'negative', target: 'merge', sourceHandle: 'output', targetHandle: 'negative' },
    { id: 'e4', source: 'merge', target: 'generate', sourceHandle: 'output', targetHandle: 'input' },
    { id: 'e5', source: 'generate', target: 'save', sourceHandle: 'output', targetHandle: 'input' },
  ], viewport: { x: 0, y: 0, zoom: 1 } };
  if (expanded) {
    const source = node('text-a', 'text_constant', '模糊海报', 0, 0);
    const exclude = node('text-b', 'text_constant', '水印', 0, 450);
    const replace = { ...node('replace', 'text_replace', '', 320, 0), data: { label: '替换', find: '模糊', replacement: '清晰' } };
    const template = node('template', 'text_template', '主题：{text}', 640, 0);
    const positive = node('to-positive', 'text_to_prompt', '', 960, 0);
    const negative = node('to-negative', 'text_to_negative', '', 320, 450);
    const merge = node('merge', 'prompt_merge', '', 1280, 160);
    const join = { ...node('join', 'text_join', '', 640, 700), data: { label: '拼接', separator: ' / ' } };
    const reroute = node('route', 'reroute', '', 960, 700);
    const select = { ...node('select', 'result_select', '', 1280, 700), data: { label: '结果选择', selection: 'b' } };
    const preview = node('out', 'text_preview', '', 1600, 700);
    const link = (a: string, b: string, port = 'input') => ({ id: `${a}-${b}-${port}`, source: a, target: b, sourceHandle: 'output', targetHandle: port });
    definition = { ...definition, nodes: [source, exclude, replace, template, positive, negative, merge, join, reroute, select, preview], edges: [link('text-a', 'replace'), link('replace', 'template'), link('template', 'to-positive'), link('text-b', 'to-negative'), link('to-positive', 'merge', 'positive'), link('to-negative', 'merge', 'negative'), link('text-a', 'join', 'a'), link('text-b', 'join', 'b'), link('join', 'route'), link('route', 'select', 'a'), link('template', 'select', 'b'), link('select', 'out')] };
  }
  const versions: any[] = fresh ? [] : [{ id: 'v0', versionNumber: 1, published: false, definition }];
  const initialVersionCount = versions.length;
  const rows = new Map<string, any>();
  const calls: any[] = [], requests: any[] = [], errors: string[] = [], checks: string[] = [];
  let failSave = true;
  const query = async (sql: string, values: any[] = []) => {
    if (sql.includes('SELECT r.*,w.name')) { const row = rows.get(values[0]); return { rows: row && row.user_id === values[1] ? [structuredClone({ ...row, definition_json: versions.find(v => v.id === row.workflow_version_id).definition, version_number: 1, published_at: null })] : [], rowCount: 1 }; }
    if (sql.includes('FROM workflows w') && sql.includes('latest.id AS version_id')) { const v = versions.find(v => !values[3] || v.id === values[3]); return { rows: v ? [{ id: 'qa-flow', version_id: v.id, version_number: v.versionNumber, published_at: null, definition_json: v.definition, step_count: v.definition.nodes.length }] : [], rowCount: v ? 1 : 0 }; }
    if (sql.includes('INSERT INTO workflow_runs')) rows.set(values[0], { id: values[0], user_id: values[1], workflow_id: values[2], workflow_version_id: values[3], total_steps: values[4], context_json: JSON.parse(values[5]), current_step: 0, status: 'in_progress' });
    if (sql.includes('context_json=jsonb_set')) { const row = rows.get(values[0]); if (!row || row.context_json.executing || row.current_step !== values[2]) return { rows: [], rowCount: 0 }; row.context_json.executing = true; return { rows: [{ id: row.id }], rowCount: 1 }; }
    if (sql.includes('UPDATE workflow_runs SET context_json=$2')) { const row = rows.get(values[0]); row.context_json = JSON.parse(values[1]); row.current_step = values[2]; row.status = values[3]; }
    if (sql.includes("context_json=context_json-'executing'")) delete rows.get(values[0]).context_json.executing;
    return { rows: [], rowCount: 1 };
  };
  const service = new StudioService({ query, transaction: async (fn: any) => fn({ query }) } as any, {} as any, { runJob: async (_actor: any, input: any) => { calls.push(input); await new Promise(resolve => setTimeout(resolve, 200)); return { job: { id: 'job' }, artifact: { id: 'image', downloadUrl: '/fixture.svg', mimeType: 'image/svg+xml', fileName: 'fixture.svg' } }; } } as any);
  const workflow = () => ({ id: 'qa-flow', name: '工作流隔离验收', description: '隔离测试', category: '测试', status: 'draft', entryType: 'workbench', versions, definition, creatorName: 'QA' });
  const dist = path.join(root, 'admin-console/dist/client');
  const server = createServer(async (req, res) => {
    try {
      if (req.url === '/fixture.svg') { res.setHeader('Content-Type', 'image/svg+xml'); res.end('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200"><rect width="320" height="200" fill="#a83248"/><circle cx="160" cy="100" r="60" fill="#f5d6a2"/></svg>'); return; }
      const rel = decodeURIComponent(new URL(req.url!, 'http://localhost').pathname).replace(/^\//, '');
      let file = path.resolve(dist, rel || 'index.html');
      if (!file.startsWith(dist + path.sep)) throw Error('path');
      let bytes; try { bytes = await readFile(file); } catch { file = path.join(dist, 'index.html'); bytes = await readFile(file); }
      res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html'); res.end(bytes);
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser: any;
  try {
    browser = await puppeteer.launch({ headless: true, executablePath: process.env.ARTEDU_BROWSER_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
    const page = await browser.newPage(); await page.setViewport({ width: 1440, height: 1000 });
    page.on('pageerror', (e: any) => errors.push(e.message));
    await page.setRequestInterception(true);
    page.on('request', async (request: any) => {
      const pathname = new URL(request.url()).pathname;
      if (!pathname.startsWith('/api/')) return request.continue();
      let body: any = { items: [] }, status = 200;
      try {
        const input = request.postData() ? JSON.parse(request.postData()) : {};
        requests.push({ pathname, method: request.method(), input });
        if (pathname === '/api/auth/me') body = actor;
        else if (pathname === '/api/admin/workflows') body = { items: [workflow()] };
        else if (pathname === '/api/admin/workflows/qa-flow') body = workflow();
        else if (pathname === '/api/workflows/qa-flow/versions') {
          if (failSave) { failSave = false; throw Error('隔离测试：保存暂时失败'); }
          const parsed = workflowVersionInputSchema.parse(input);
          definition = parsed.definition;
          body = { id: `v${versions.length + 1}`, versionNumber: versions.length + 1, published: false, definition };
          versions.unshift(body);
        } else if (pathname === '/api/workflows/qa-flow/runs') body = await service.startWorkflow(actor, 'qa-flow', input);
        else if (/\/workflow-runs\/[^/]+\/execute$/.test(pathname)) body = await service.executeRun(actor, pathname.split('/')[3], input);
        else if (pathname === '/api/me/workflow-runs') body = { items: await Promise.all([...rows.keys()].map(id => service.getWorkflowRun(actor, id))) };
      } catch (e: any) { status = 409; body = { message: e.message }; }
      await request.respond({ status, contentType: 'application/json', body: JSON.stringify(body) });
    });
    await page.goto(`http://127.0.0.1:${(server.address() as any).port}/admin/workflows`);
    await (await page.waitForSelector('::-p-text(工作流隔离验收)')).click();
    await page.waitForSelector('.workflow-flow-node');
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(() => [...document.querySelectorAll('.react-flow__node')].every(node => getComputedStyle(node).opacity === '1' && node.getBoundingClientRect().width > 0));
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await page.waitForFunction(() => {
      const state = window as any;
      const position = [...document.querySelectorAll('.react-flow__node')].map(node => { const box = node.getBoundingClientRect(); return [box.x, box.y, box.width, box.height]; });
      const key = JSON.stringify(position);
      state.workflowStableFrames = state.workflowLastPosition === key ? (state.workflowStableFrames ?? 0) + 1 : 0;
      state.workflowLastPosition = key;
      return state.workflowStableFrames >= 5;
    });
    if (expanded) {
      const initialCount = definition.nodes.length;
      await (await page.waitForSelector('::-p-text(节点库)')).click();
      assert.equal(await page.$$eval('.workflow-node-list > button', (buttons: any[]) => buttons.length), 23);
      checks.push('23-node-palette-including-nine-new-types');
      await (await page.waitForSelector('::-p-text(文字拼接模板)')).click();
      await page.waitForFunction((count: number) => document.querySelectorAll('.react-flow__node').length === count, {}, initialCount + 4);
      await (await page.waitForSelector('.workflow-flow-tools button[title="撤销 Ctrl+Z"]')).click();
      await page.waitForFunction((count: number) => document.querySelectorAll('.react-flow__node').length === count, {}, initialCount);
      checks.push('insert-connected-template-and-undo');
      await page.select('.react-flow__node[data-id="select"] select', 'a');
      assert.equal(await page.$eval('.react-flow__node[data-id="select"] select', (el: any) => el.value), 'a');
      checks.push('editable-selection-widget');
      failSave = false;
      await (await page.$('.workflow-canvas-run-top')).click();
      await page.waitForSelector('.workflow-canvas-runner__done', { timeout: 15000 });
      const last: any = [...rows.values()][0];
      assert.equal(last.status, 'completed');
      assert.equal(last.context_json.text, '模糊海报 / 水印');
      assert.equal(last.context_json.nodeResults.replace.text, '清晰海报');
      assert.equal(last.context_json.nodeResults.merge.prompt, '主题：清晰海报');
      assert.equal(last.context_json.nodeResults.merge.negativePrompt, '水印');
      assert.equal(versions[0].definition.nodes.find((node: any) => node.id === 'select').data.selection, 'a');
      assert.equal(calls.length, 0);
      checks.push('all-nine-types-save-execute-and-display-real-text');
      await page.screenshot({ path: path.join(output, 'nodes-desktop.png'), fullPage: true });
      await page.setViewport({ width: 390, height: 844 });
      await page.screenshot({ path: path.join(output, 'nodes-mobile.png'), fullPage: true });
      assert.deepEqual(errors, []); checks.push('no-browser-errors');
      const report = { mode: 'new nodes: actual frontend and StudioService, isolated SQL fixture, no model calls', checks, passed: checks.length, errors };
      await writeFile(path.join(output, 'ui-results.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));
      return;
    }
    const first = await page.$(fresh ? '.react-flow__node[data-id="input-1"]' : '.react-flow__node[data-id="input"]');
    const drag = async (selector: string) => {
      const before = await first.evaluate((el: any) => el.style.transform);
      const target = await first.$(selector), box = await target.boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 + 45, box.y + box.height / 2 + 35, { steps: 10 }); await page.mouse.up();
      await page.waitForFunction((id: string, position: string) => document.querySelector(`.react-flow__node[data-id="${id}"]`)?.getAttribute('style')?.includes(position) === false, {}, fresh ? 'input-1' : 'input', before);
      assert.notEqual(await first.evaluate((el: any) => el.style.transform), before);
    };
    await drag('.workflow-flow-node__body > strong');
    await drag('.workflow-flow-node__body > p');
    checks.push('drag-title-and-description');
    const beforeTyping = await first.evaluate((el: any) => el.style.transform);
    const textarea = await first.$('textarea'); await textarea.click(); await page.keyboard.type('测试');
    assert.equal(await first.evaluate((el: any) => el.style.transform), beforeTyping);
    checks.push('typing-keeps-node-position');
    const startButton = await page.$('.workflow-canvas-run-top');
    await startButton.click();
    await page.waitForSelector('.workflow-canvas-runner__error');
    assert.equal(rows.size, 0); assert.equal(versions.length, initialVersionCount);
    checks.push('save-failure-keeps-draft-and-does-not-start');
    await startButton.click();
    await page.waitForFunction(() => [...document.querySelectorAll('.workflow-canvas-runner__done')].length > 0, { timeout: 15000 });
    assert.equal(versions.length, initialVersionCount + 1); assert.equal(rows.size, 1); assert.equal(calls.length, 1);
    const startRequest = requests.find(r => r.pathname.endsWith('/qa-flow/runs'));
    assert.equal(startRequest.input.versionId, versions[0].id);
    assert.equal(requests.filter(r => r.pathname.endsWith('/versions')).every(r => r.input.publish === false), true);
    assert.match(calls[0].prompt, fresh ? /画面主体明确/ : /红色/); assert.match(calls[0].parameters.negativePrompt, /水印/);
    checks.push('retry-save-exact-version-auto-run-to-image-without-publishing');
    await startButton.click();
    await page.waitForFunction(() => document.querySelector('.workflow-canvas-runner__done') !== null && !document.querySelector<HTMLButtonElement>('.workflow-canvas-run-top')!.disabled, { timeout: 15000 });
    assert.equal(rows.size, 2); assert.equal(calls.length, 2);
    checks.push('run-again-after-completion');
    await page.screenshot({ path: path.join(output, 'workflow-desktop.png'), fullPage: true });
    await page.setViewport({ width: 390, height: 844 });
    await page.waitForFunction(() => document.querySelector('.workflow-canvas-topbar')!.getBoundingClientRect().height > 150);
    await page.waitForFunction(() => {
      const canvas = document.querySelector('.workflow-flow-wrap')!.getBoundingClientRect();
      return [...document.querySelectorAll('.react-flow__node')].some(node => {
        const box = node.getBoundingClientRect();
        return box.left < canvas.right && box.right > canvas.left && box.top < canvas.bottom && box.bottom > canvas.top;
      });
    });
    checks.push('mobile-resize-keeps-workflow-in-view');
    assert.equal(await page.evaluate(() => {
      const exit = document.querySelector('.workflow-editor-fullscreen > .learning-back')!.getBoundingClientRect();
      const buttons = [...document.querySelectorAll('.workflow-editor-actions button')].map(el => el.getBoundingClientRect());
      return buttons.every(button => button.top >= exit.bottom);
    }), true);
    checks.push('mobile-exit-and-save-buttons-do-not-overlap');
    await page.screenshot({ path: path.join(output, 'workflow-mobile.png'), fullPage: true });
    assert.deepEqual(errors, []);
    checks.push('no-browser-runtime-errors');
    const report = { mode: 'production frontend + actual StudioService; isolated database and image model', checks, passed: checks.length, errors };
    await writeFile(path.join(output, 'ui-results.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));
  } catch (error) {
    if (browser) { const pages = await browser.pages(); await pages.at(-1)?.screenshot({ path: path.join(output, 'failure.png'), fullPage: true }); }
    throw error;
  } finally { if (browser) await browser.close(); await new Promise<void>(resolve => server.close(() => resolve())); }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
