import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
const apiRequire = createRequire(new URL('../../apps/api/package.json', import.meta.url));
const { default: puppeteer } = await import(pathToFileURL(apiRequire.resolve('puppeteer-core')).href);

test('并发对话不串消息，暂停隔离，成果离线保留并随会话删除', { timeout: 90000 }, async () => {
  const server = await createServer({ configFile: false, root: new URL('..', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'), plugins: [react()], server: { host: '127.0.0.1', port: 0 } });
  await server.listen();
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  try {
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    let online = true;
    page.on('request', request => {
      if (request.url().includes('/api/agent-runs/workspace-preview/')) {
        const pathname = new URL(request.url()).pathname;
        if (!online) return void request.respond({ status: 410, body: 'expired' });
        const css = pathname.endsWith('.css'), image = pathname.endsWith('.svg');
        return void request.respond({ status: 200, contentType: css ? 'text/css' : image ? 'image/svg+xml' : 'text/html', body: css ? 'body{background:rgb(12,34,56)}' : image ? '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="red"/></svg>' : '<!doctype html><html><head><link rel="stylesheet" href="style.css"></head><body><h1>LOCAL_BLOG</h1><img src="hero.svg"><button onclick="document.querySelector(\'h1\').textContent=\'CLICKED\'">Test</button></body></html>' });
      }
      void request.continue();
    });
    await page.goto(server.resolvedUrls.local[0] + 'tests/fixtures/concurrent-workspace.html');
    await page.waitForSelector('#artedu-thread-prompt');
    const send = async text => { await page.type('#artedu-thread-prompt', text); await page.click('button.ai-submit'); await page.waitForFunction(key => !!window.__runs[key], {}, text); };
    const blank = () => page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent === '新对话').click());
    const text = () => page.$eval('.creation-canvas__thread', node => node.textContent);
    await send('ALPHA');
    await blank();
    await page.evaluate(() => window.__runs.ALPHA.delta('OLD_DELTA'));
    await new Promise(resolve => setTimeout(resolve, 80));
    assert.ok(!(await text()).includes('OLD_DELTA'));
    assert.equal(await page.$eval('#artedu-thread-prompt', el => el.disabled), false);
    await send('BETA');
    await page.evaluate(() => window.__runs.ALPHA.resolve({status:'succeeded',content:'ALPHA_FINAL'}));
    await page.waitForFunction(async () => (await window.__stored()).some(c => c.messages.some(m => m.content === 'ALPHA_FINAL')));
    assert.ok(!(await text()).includes('ALPHA_FINAL'));
    assert.equal(await page.$eval('#artedu-thread-prompt', el => el.disabled), true);
    await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent === '暂停输出').click());
    await page.waitForFunction(() => !document.querySelector('#artedu-thread-prompt').disabled);
    await blank();
    await send('GAMMA');
    await blank();
    await send('DELTA');
    await page.evaluate(() => window.__runs.GAMMA.reject(Error('OLD_FAILURE')));
    await page.waitForFunction(async () => (await window.__stored()).some(c => c.messages.some(m => m.content === 'OLD_FAILURE')));
    assert.ok(!(await text()).includes('OLD_FAILURE'));
    await page.evaluate(() => window.__runs.DELTA.resolve({status:'succeeded',content:'DELTA_FINAL',delivery:{status:'succeeded',artifacts:[{kind:'webpage',path:'index.html',openUrl:'/api/agent-runs/workspace-preview/test/index.html',validation:'pass'}]}}));
    await page.waitForSelector('[data-open-local]');
    const archive = await page.evaluate(async () => {
      const c = (await window.__stored()).find(c => c.title === 'DELTA');
      const a = c.messages.at(-1).localArtifacts[0];
      const record = await window.__artifact(a.localArchiveId);
      return { id: a.localArchiveId, files: record.files.length, html: await record.blob.text() };
    });
    assert.equal(archive.files, 3); assert.match(archive.html, /data:text\/css/); assert.match(archive.html, /data:image\/svg\+xml/);
    online = false;
    await page.reload(); await page.waitForSelector('[data-open-local]'); await page.click('[data-open-local]');
    await page.waitForFunction(() => document.querySelector('dialog').open);
    const frame = await (await page.$('dialog[open] iframe')).contentFrame();
    await frame.waitForSelector('h1'); assert.equal(await frame.$eval('h1', el => el.textContent), 'LOCAL_BLOG');
    assert.equal(await frame.$eval('img', el => el.complete && el.naturalWidth > 0), true);
    assert.equal(await frame.$eval('body', el => getComputedStyle(el).backgroundColor), 'rgb(12, 34, 56)');
    await frame.click('button'); assert.equal(await frame.$eval('h1', el => el.textContent), 'CLICKED');
    assert.equal(await frame.evaluate(() => { try { return !!parent.document; } catch { return false; } }), false);
    await page.evaluate(() => document.querySelector('dialog[open]').close());
    await page.evaluate(() => document.querySelector('.creation-canvas__history-item.is-active .creation-canvas__history-menu-toggle').click());
    await page.evaluate(() => [...document.querySelectorAll('[role="menuitem"]')].find(b => b.textContent.includes('删除对话')).click());
    await page.waitForSelector('.feedback-dialog');
    await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent === '确认删除').click());
    await page.waitForFunction(async id => !(await window.__artifact(id)), {}, archive.id);
  } finally { await browser.close(); await server.close(); }
});
