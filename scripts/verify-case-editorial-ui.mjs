// Read-only case audit and form preview. Login sessions only; no draft/comment/reaction writes.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { findCaseEditorialIssues } from '../admin-console/src/caseEditorial.js';
const require = createRequire(path.join(process.env.ARTEDU_PLAYWRIGHT_ROOT, 'package.json'));
const { chromium } = require('playwright');
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
const output = path.resolve('apps/api/data/qa/editorial/ui');
await mkdir(output, {recursive:true});
try {
  for (const username of ['student.demo','teacher.demo','operator.demo','admin.demo']) {
    const context = await browser.newContext();
    assert.ok((await context.request.post('http://localhost:4173/api/auth/login',{data:{username,password:process.env.ARTEDU_DEMO_PASSWORD}})).ok());
    const me = await (await context.request.get('http://localhost:4173/api/auth/me')).json();
    const {items} = await (await context.request.get('http://localhost:4173/api/works')).json();
    assert.equal(items.length,11);
    assert.ok(!items.some(item=>item.title==='端到端验证：AI 艺术教学案例'));
    let readableNotes=0;
    for (const item of items) {
      const response = await context.request.get(`http://localhost:4173/api/works/${encodeURIComponent(item.id)}`);
      assert.ok(response.ok());
      const detail = await response.json();
      assert.deepEqual(findCaseEditorialIssues(detail),[],`${username}: ${item.title}`);
      const privileged = me.id===detail.authorId || me.roles?.some(role=>['teacher','operator','admin'].includes(role));
      if(!privileged) assert.equal(detail.story.editorialNote,'');
      if(detail.story.editorialNote) readableNotes++;
    }
    console.log(`${username}: all 11 public cases clean; private-note permissions checked`);
    if(username!=='student.demo'){await context.close();continue;}
    const page = await context.newPage({viewport:{width:1440,height:1000}});
    const errors=[]; page.on('pageerror',error=>errors.push(error.message));
    await page.goto('http://localhost:4173/community?work=work-65ec6cbb-c891-43d3-a25e-3e3de376dea0',{waitUntil:'networkidle'});
    await page.locator('.community-detail').waitFor();
    assert.doesNotMatch(await page.locator('.community-detail').innerText(),/返回\s*404|资料整理说明|待提供有效视频|本文为依据原作/);
    assert.ok(await page.getByRole('link',{name:/查看原作/}).isVisible());
    for(const [width,height,name] of [[1440,1000,'desktop'],[390,844,'mobile']]) {
      await page.setViewportSize({width,height});
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
      await page.locator('.community-detail').screenshot({path:path.join(output,`clean-case-${name}.png`)});
    }
    await page.getByRole('button',{name:/返回案例社区/}).click();
    await page.getByRole('textbox',{name:'搜索案例',exact:true}).fill('连年有余');
    await page.locator('.work-grid > .work-card').first().getByRole('button',{name:/查看案例/}).click();
    await page.locator('.case-story').waitFor();
    assert.match(await page.locator('.case-story').innerText(),/Photoshop、Adobe Illustrator/);
    assert.doesNotMatch(await page.locator('.case-story').innerText(),/资料整理说明/);
    await page.getByRole('button',{name:/返回案例社区/}).click();
    await page.getByRole('button',{name:/新建案例草稿/}).click();
    const form=page.getByRole('form',{name:'案例草稿编辑'});
    await form.getByRole('textbox',{name:/^项目简介/}).fill('资料整理说明：视频待作者补充');
    await form.locator('.case-editorial-warning').waitFor();
    assert.match(await form.locator('.case-editorial-warning').innerText(),/移到“编辑备注”/);
    await form.getByRole('textbox',{name:/^项目简介/}).fill('我们从传统纹样中提取结构关系，探索数字艺术的视觉表达。');
    await form.getByRole('textbox',{name:/^编辑备注/}).fill('资料整理说明：原作视频待作者补充');
    assert.equal(await form.locator('.case-editorial-warning').count(),0,'private notes do not block author text');
    await form.screenshot({path:path.join(output,'editor-private-note.png')});
    await form.getByRole('button',{name:'关闭案例编辑',exact:true}).click();
    assert.deepEqual(errors,[]);
    await context.close();
  }
  console.log('PASS: four-account audit, author text retained, operational notes absent, private-note access, live input warnings, two viewports, zero page errors; no content writes');
} finally {await browser.close();}
