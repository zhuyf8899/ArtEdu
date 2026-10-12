// Read-only UI verification: login sessions and unsaved form checks only.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir} from 'node:fs/promises';
import path from 'node:path';
const require=createRequire(path.join(process.env.ARTEDU_PLAYWRIGHT_ROOT,'package.json'));
const {chromium}=require('playwright');
const output=path.resolve('apps/api/data/qa/collections/ui');await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,channel:'msedge'});
try{
 for(const username of ['student.demo','admin.demo']){
  const context=await browser.newContext();
  assert.ok((await context.request.post('http://localhost:4173/api/auth/login',{data:{username,password:process.env.ARTEDU_DEMO_PASSWORD}})).ok());
  const page=await context.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://localhost:4173/community',{waitUntil:'networkidle'});
  const curated=page.locator('#featured-art-cases'),community=page.locator('#community-cases');
  await curated.locator('.work-card').waitFor();
  assert.equal(await curated.locator('.work-card').count(),1);assert.equal(await community.locator('.work-card').count(),10);
  assert.match(await curated.innerText(),/Reflections on Mechanical Creativity/);
  assert.doesNotMatch(await community.innerText(),/Reflections on Mechanical Creativity/);
  if(username==='student.demo'){
   for(const [width,height,name] of [[1440,1000,'desktop'],[768,1024,'tablet'],[390,844,'mobile']]){
    await page.setViewportSize({width,height});
    await page.evaluate(async()=>{await document.fonts.ready;});
    for(const image of await page.locator('.work-preview img').all()) { await image.scrollIntoViewIfNeeded(); await image.evaluate(img=>img.decode()); }
    await page.evaluate(()=>window.scrollTo(0,0));
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${name}: no overflow`);
    for(const module of [curated,community]){
     const cards=await module.locator('.work-card').evaluateAll(els=>els.map(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};}));
     for(let i=0;i<cards.length;i++)for(let j=i+1;j<cards.length;j++){
      const a=cards[i],b=cards[j];assert.ok(a.x+a.w<=b.x+1||b.x+b.w<=a.x+1||a.y+a.h<=b.y+1||b.y+b.h<=a.y+1,'cards do not overlap');
     }
    }
    await page.screenshot({path:path.join(output,`${name}.png`),fullPage:true});
   }
   await page.setViewportSize({width:1440,height:1000});
   await page.getByRole('navigation',{name:'案例模块入口'}).getByRole('link',{name:/社区案例/}).click();
   assert.ok(await community.getByRole('heading',{name:/社区案例/}).isVisible());
   assert.equal(new URL(page.url()).pathname,'/community');
   await page.getByRole('textbox',{name:'搜索案例',exact:true}).fill('Reflections');
   assert.equal(await curated.locator('.work-card').count(),1);assert.equal(await community.locator('.work-card').count(),0);
   await community.getByRole('button',{name:'清除筛选条件',exact:true}).click();
   assert.equal(await community.locator('.work-card').count(),10);
   await page.getByRole('textbox',{name:'搜索案例',exact:true}).fill('连年有余');
   assert.equal(await curated.locator('.work-card').count(),0);assert.equal(await community.locator('.work-card').count(),1);
   await page.getByRole('button',{name:'清除搜索',exact:true}).click();
   await page.getByRole('tab',{name:'大类',exact:true}).click();
   await page.getByRole('button',{name:'AI 艺术',exact:true}).click();
   assert.equal(await curated.locator('.work-card').count(),1);assert.equal(await community.locator('.work-card').count(),0);
   await page.getByRole('button',{name:'全部',exact:true}).click();
  }
  await curated.getByRole('button',{name:/查看案例/}).click();await page.locator('.community-detail').waitFor();
  assert.equal(await page.getByRole('combobox',{name:'案例所属模块',exact:true}).count(),username==='admin.demo'?1:0);
  if(username==='admin.demo')assert.equal(await page.getByRole('combobox',{name:'案例所属模块',exact:true}).inputValue(),'art-selection');
  assert.ok(await page.getByRole('link',{name:/查看原作/}).isVisible());
  await page.getByRole('button',{name:/返回案例社区/}).click();
  assert.equal(await curated.locator('.work-card').count(),1);
  await page.reload({waitUntil:'networkidle'});await curated.locator('.work-card').first().waitFor();assert.equal(await curated.locator('.work-card').count(),1);
  assert.deepEqual(errors,[]);await context.close();
  console.log(`${username}: two modules, counts, discovery, detail and curator control verified`);
 }
 console.log('PASS: desktop/tablet/mobile, no overlaps or overflow, search/tags/empty reset, module anchors, stable classification on reload, source link and curator-only control; no content writes');
}finally{await browser.close();}
