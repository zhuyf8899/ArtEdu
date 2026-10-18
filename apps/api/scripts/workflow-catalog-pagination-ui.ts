/**
 * 工作流目录分页的浏览器回归：用生产构建 + 拦截 API，验证「共 25 条」时
 * 第一页 20 条、加载更多后 25 条、搜索无结果时给出与空目录不同的提示。
 *
 * 运行（仓库根目录）：
 *   ./apps/api/node_modules/.bin/tsx apps/api/scripts/workflow-catalog-pagination-ui.ts
 * 截图与结果写到 local-artifacts/workflow-catalog-pagination/。
 */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const dist = path.join(root, 'admin-console', 'dist', 'client');
const outDir = path.join(root, 'local-artifacts', 'workflow-catalog-pagination');
const actor = { id: 'qa-admin', username: 'admin.demo', displayName: 'QA 管理员', roles: ['admin'], accountStatus: 'active' };
const TOTAL = 25;
const all = Array.from({ length: TOTAL }, (_, index) => ({
  id: `qa-workflow-${index + 1}`,
  name: `分页验收工作流 ${index + 1}`,
  description: `第 ${index + 1} 条工作流，用于确认第 21 条之后也能在目录里打开。`,
  category: '视觉创作',
  status: 'published',
  versionId: `v-${index + 1}`,
  versionNumber: 1,
  versionPublished: true,
  stepCount: 3,
}));

const checks: string[] = [];
const requests: string[] = [];

const server = createServer(async (req, res) => {
  try {
    const rel = decodeURIComponent(new URL(req.url!, 'http://localhost').pathname).replace(/^\//, '');
    let file = path.resolve(dist, rel || 'index.html');
    if (!file.startsWith(dist + path.sep)) throw new Error('path');
    let bytes: Buffer;
    try { bytes = await readFile(file); } catch { file = path.join(dist, 'index.html'); bytes = await readFile(file); }
    res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.svg') ? 'image/svg+xml' : 'text/html');
    res.end(bytes);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${(server.address() as any).port}`;

let browser: any;
const errors: string[] = [];
try {
  const puppeteer = require('puppeteer-core');
  browser = await puppeteer.launch({ headless: true, executablePath: process.env.ARTEDU_BROWSER_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1200 });
  page.on('pageerror', (error: any) => errors.push(error.message));
  await page.setRequestInterception(true);
  page.on('request', async (request: any) => {
    const url = new URL(request.url());
    if (!url.pathname.startsWith('/api/')) return request.continue();
    let body: any = { items: [] };
    try {
      if (url.pathname === '/api/auth/me') body = actor;
      else if (url.pathname === '/api/workflows') {
        requests.push(url.search);
        const query = (url.searchParams.get('query') ?? '').trim();
        const pageNo = Number(url.searchParams.get('page') ?? 1);
        const pageSize = Number(url.searchParams.get('pageSize') ?? 20);
        const matched = query ? all.filter((item) => item.name.includes(query) || item.description.includes(query)) : all;
        body = { items: matched.slice((pageNo - 1) * pageSize, pageNo * pageSize), page: pageNo, pageSize, total: matched.length };
      }
      else if (url.pathname.startsWith('/api/workflow-runs')) body = {};
    } catch (error: any) { body = { message: error.message }; }
    await request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });

  await page.goto(`${base}/studio`, { waitUntil: 'domcontentloaded' });
  const search = await page.waitForSelector('.workflow-catalog__search input', { timeout: 30000 });
  checks.push('search-box-rendered');

  await page.waitForFunction(() => document.querySelectorAll('.workflow-card').length === 20, { timeout: 30000 });
  const firstPager = await page.$eval('.workflow-catalog__pager', (node: any) => node.textContent.replace(/\s+/g, ' '));
  assert.match(firstPager, /已显示 20 \/ 25/, `首屏应显示 20/25，实际：${firstPager}`);
  assert.match(firstPager, /还有 5 条/, `首屏应提示还有 5 条，实际：${firstPager}`);
  checks.push('first-page-20-of-25');

  await (await page.waitForSelector('.workflow-catalog__pager button')).click();
  await page.waitForFunction(() => document.querySelectorAll('.workflow-card').length === 25, { timeout: 30000 });
  const secondPager = await page.$eval('.workflow-catalog__pager', (node: any) => node.textContent.replace(/\s+/g, ' '));
  assert.match(secondPager, /已显示 25 \/ 25/, `加载更多后应显示 25/25，实际：${secondPager}`);
  assert.equal(await page.$$eval('.workflow-catalog__pager button', (nodes: any[]) => nodes.length), 0, '全部加载完后不应再留「加载更多」');
  checks.push('load-more-reaches-25-without-duplicates');

  await search.type('不存在的关键词');
  await page.keyboard.press('Enter');
  await page.waitForSelector('.empty-state', { timeout: 30000 });
  const empty = await page.$eval('.empty-state', (node: any) => node.textContent.replace(/\s+/g, ' '));
  assert.match(empty, /没有匹配的节点工作流/, `搜索无结果要和空目录区分，实际：${empty}`);
  assert.ok(requests.some((search) => search.includes('query=')), '搜索必须把关键词发给后端，而不是只在前端过滤');
  checks.push('search-empty-state-and-query-param');

  await mkdir(outDir, { recursive: true });
  await page.screenshot({ path: path.join(outDir, 'catalog.png'), fullPage: true });
  await writeFile(path.join(outDir, 'result.json'), JSON.stringify({ checks, requests, errors }, null, 2));
  console.log(JSON.stringify({ passed: checks.length, checks, requests, errors }));
} finally {
  if (browser) await browser.close();
  server.close();
}
