import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

// 本地只读回归：待审核状态仅替换浏览器 GET 响应，绝不修改真实投稿或发送审核决定。
const origin = new URL(process.env.ARTEDU_TEST_ORIGIN || 'http://localhost:4173');
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname));
assert.ok(['http:', 'https:'].includes(origin.protocol) && !origin.username && !origin.password);
const { chromium } = createRequire(import.meta.url)('playwright');
const browser = await chromium.launch({ headless: true, channel: process.env.ARTEDU_BROWSER_CHANNEL || 'msedge' });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const output = path.resolve('apps/api/data/qa/review-layout');
await mkdir(output, { recursive: true });
let blockedWrites = 0, failWork = false;
const checks = [];
try {
  const login = await context.request.post(new URL('/api/auth/login', origin).href, {
    headers: { origin: origin.origin }, data: { username: 'admin.demo', password: process.env.ARTEDU_TEST_PASSWORD || '123456' },
  });
  assert.equal(login.status(), 201, 'Local demo administrator must log in');
  const reviewsResponse = await context.request.get(new URL('/api/admin/reviews', origin).href);
  assert.equal(reviewsResponse.status(), 200);
  const { items: reviews } = await reviewsResponse.json();
  assert.ok(Array.isArray(reviews) && reviews.length >= 2);
  const selected = reviews.slice(0, 2);
  const works = new Map();
  for (const review of selected) {
    const response = await context.request.get(new URL(`/api/works/${review.id}`, origin).href);
    assert.equal(response.status(), 200);
    works.set(review.id, { ...await response.json(), status: 'pending' });
  }
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.route('**/api/**', async route => {
    const request = route.request(), url = new URL(request.url());
    if (!['GET', 'HEAD'].includes(request.method())) { blockedWrites++; await route.abort(); return; }
    if (url.pathname === '/api/admin/reviews') {
      await route.fulfill({ json: { items: selected.map(review => ({ ...review, status: 'pending' })) } }); return;
    }
    const id = url.pathname.match(/^\/api\/works\/([^/]+)$/)?.[1];
    if (id && works.has(id)) {
      if (failWork) { await route.fulfill({ status: 503, json: { message: '模拟临时加载失败' } }); }
      else await route.fulfill({ json: works.get(id) });
      return;
    }
    await route.continue();
  });
  await page.goto(new URL('/admin/reviews', origin).href);
  const queue = page.locator('.queue-items > button');
  await queue.first().waitFor();
  await queue.first().click();
  const approve = page.getByRole('button', { name: '通过并发布', exact: true });
  await approve.waitFor();
  await page.locator('.review-case-content').waitFor();
  assert.ok(await approve.isEnabled());

  for (const viewport of [{ width: 1440, height: 900 }, { width: 1092, height: 764 }, { width: 768, height: 1024 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport);
    const geometry = await page.evaluate(() => {
      const rect = selector => { const element = document.querySelector(selector), bounds = element.getBoundingClientRect(); return { left: bounds.left, right: bounds.right, top: bounds.top, bottom: bounds.bottom, height: bounds.height, width: bounds.width, scrollWidth: element.scrollWidth, clientWidth: element.clientWidth }; };
      return { width: innerWidth, height: innerHeight, dialog: rect('.review-dialog'), body: rect('.review-dialog-body'), footer: rect('.review-dialog-footer'), header: rect('.review-dialog-header') };
    });
    assert.ok(geometry.dialog.left >= -1 && geometry.dialog.right <= viewport.width + 1, 'Dialog fits width');
    assert.ok(geometry.footer.bottom <= viewport.height + 1 && geometry.footer.top >= 0, 'Actions always visible');
    assert.ok(geometry.body.height > 70 && geometry.body.scrollWidth <= geometry.body.clientWidth + 1, 'Content is not squeezed or horizontally clipped');
    assert.ok(geometry.header.bottom <= geometry.body.top + 1 && geometry.body.bottom <= geometry.footer.top + 1, 'Header/body/footer do not overlap');
    const clipped = await page.locator('.review-case-summary').evaluate(element => element.scrollHeight > element.clientHeight + 1);
    if (clipped) {
      const toggle = page.getByRole('button', { name: '展开完整简介', exact: true });
      await toggle.waitFor();
      await toggle.click();
      assert.ok(await page.locator('.review-case-summary').evaluate(element => element.scrollHeight <= element.clientHeight + 1));
      await page.getByRole('button', { name: '收起简介', exact: true }).click();
    }
    await page.screenshot({ path: path.join(output, `pending-fixture-${viewport.width}x${viewport.height}.png`) });
    checks.push({ viewport, geometry });
  }
  await page.setViewportSize({ width: 1092, height: 764 });
  await page.getByRole('button', { name: '退回修改', exact: true }).click();
  assert.equal(await page.locator('.review-decision-note textarea').getAttribute('aria-invalid'), 'true');
  const note = page.locator('.review-decision-note textarea');
  await note.fill('请补充创作过程与具体工具。');
  assert.equal(await note.getAttribute('maxlength'), '1000');
  await page.getByRole('button', { name: '下一件作品', exact: true }).click();
  await page.locator('.review-case-content').waitFor();
  assert.equal(await note.inputValue(), '', 'Notes must not leak between submissions');
  await page.getByRole('button', { name: '上一件作品', exact: true }).click();
  await page.locator('.review-case-content').waitFor();
  assert.equal(await note.inputValue(), '请补充创作过程与具体工具。', 'Draft note is retained while switching');
  await page.getByRole('button', { name: '退回修改', exact: true }).click();
  await page.getByRole('alertdialog').waitFor();
  await page.keyboard.press('Tab');
  assert.ok(await page.evaluate(() => Boolean(document.activeElement.closest('.feedback-dialog'))));
  await page.keyboard.press('Escape');
  await page.getByRole('alertdialog').waitFor({ state: 'hidden' });
  assert.equal(await page.locator('.review-dialog').count(), 1, 'Cancel confirmation must keep review open');
  await approve.click();
  await page.getByRole('alertdialog').waitFor();
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await page.getByRole('alertdialog').waitFor({ state: 'hidden' });

  await page.getByRole('button', { name: '查看图集图片 1', exact: true }).click();
  await page.locator('.image-lightbox').waitFor();
  await page.keyboard.press('Escape');
  await page.locator('.image-lightbox').waitFor({ state: 'hidden' });
  assert.equal(await page.locator('.review-dialog').count(), 1);
  await page.getByRole('button', { name: '关闭审核工作区', exact: true }).click();
  failWork = true;
  await queue.first().click();
  await page.getByText('作品资料加载失败', { exact: true }).waitFor();
  assert.equal(await approve.isEnabled(), false);
  failWork = false;
  await page.getByRole('button', { name: '重新加载', exact: true }).click();
  await page.locator('.review-case-content').waitFor();
  assert.ok(await approve.isEnabled());
  // 服务端状态已变化时即便列表仍显示待审核，也不能再次决定。
  works.set(selected[0].id, { ...works.get(selected[0].id), status: 'approved' });
  await page.getByRole('button', { name: '关闭审核工作区', exact: true }).click();
  await queue.first().click();
  await page.getByText('作品状态已变化，请关闭后刷新审核列表。', { exact: true }).waitFor();
  assert.equal(await approve.isEnabled(), false);
  assert.deepEqual(pageErrors, []);
  assert.equal(blockedWrites, 0, 'No real moderation or generation requests are permitted');
  await writeFile(path.join(output, 'checks.json'), JSON.stringify({ checks, pageErrors, blockedWrites, fixtureOnly: true }, null, 2));
  console.log(`PASS ${checks.length} viewport layouts; notes isolation, confirmation cancellation, image preview, load retry, stale state; no moderation writes.`);
} finally {
  await context.request.post(new URL('/api/auth/logout', origin).href, { headers: { origin: origin.origin }, data: {} }).catch(() => {});
  await browser.close();
}
