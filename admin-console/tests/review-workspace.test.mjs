import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { canDecideReview, reviewDate } from '../src/reviewPresentation.js';

test('只有资料完整、同一作品且仍待审核时才可操作', () => {
  const review = { id: 'a', status: 'pending' };
  assert.equal(canDecideReview(review, null), false);
  assert.equal(canDecideReview(review, { id: 'b', status: 'pending' }), false);
  assert.equal(canDecideReview(review, { id: 'a', status: 'approved' }), false);
  assert.equal(canDecideReview({ ...review, status: 'rejected' }, review), false);
  assert.equal(canDecideReview(review, { ...review }), true);
});

test('审核时间显示中国时区，不将空时间误显示为1970年', () => {
  assert.match(reviewDate('2026-10-12T06:03:00.000Z'), /10\/12.*14:03/);
  for (const value of [null, undefined, '', 'bad-date']) assert.equal(reviewDate(value), '暂无提交时间');
});

test('审核工作区使用独立适屏弹窗、固定操作区域和可重试资料请求', async () => {
  const source = await readFile(new URL('../src/ReviewDialog.jsx', import.meta.url), 'utf8');
  const css = await readFile(new URL('../src/review-workspace.css', import.meta.url), 'utf8');
  assert.match(source, /createPortal/);
  assert.match(source, /role="dialog" aria-modal="true"/);
  assert.match(source, /review-dialog-body[\s\S]*<footer className="review-dialog-footer"/);
  assert.match(source, /重新加载/);
  assert.match(source, /disabled={!ready \|\| busy}/);
  assert.match(source, /maxLength=\{1000\}/);
  assert.match(source, /notes\[review.id\]/);
  assert.match(source, /document.body.style.overflow = previousOverflow/);
  assert.match(source, /event.key === "Tab"/);
  assert.match(source, /\.image-lightbox/);
  assert.match(source, /\.feedback-dialog-layer/);
  assert.match(css, /grid-template-rows: auto minmax\(0,1fr\) auto/);
  assert.match(css, /@media \(max-width: 760px\)/);
  assert.match(css, /review-dialog-body { display: block; }/);
});

test('公开作品与管理员私有核对资料分区，保留服务器审核与最终确认', async () => {
  const source = await readFile(new URL('../src/CaseReviewContent.jsx', import.meta.url), 'utf8');
  const admin = await readFile(new URL('../src/AdminDashboard.jsx', import.meta.url), 'utf8');
  assert.match(source, /showMeta={false} showSource={false}/);
  assert.match(source, /不对读者公开/);
  assert.match(source, /safeCaseSourceUrl/);
  assert.match(admin, /await confirmAction/);
  assert.match(admin, /await reviewSubmission/);
  assert.doesNotMatch(admin, /function ReviewDrawer|平均等待/);
});
