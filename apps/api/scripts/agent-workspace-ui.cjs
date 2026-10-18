const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const {chromium}=require('C:/Users/24783/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const out=path.resolve('local-artifacts/agent-workspace-20261018');const data=JSON.parse(fs.readFileSync(path.join(out,'eleven-results.json'),'utf8'));
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});const cases=[];
 try{for(const item of data.cases){
  const context=await browser.newContext({viewport:{width:1280,height:900}});await context.route('**/__agent-regression.json',r=>r.fulfill({json:data}));await context.route('**/api/generation-jobs/**',r=>r.fulfill({contentType:'image/png',body:fs.readFileSync(path.resolve('local-artifacts/agent-sandbox-20261018/repair/round-3/test11-generated.png'))}));const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto((process.env.WORKSPACE_UI_URL||'http://localhost:4173')+'/tests/fixtures/agent-workspace.html?case='+item.id);
  await page.locator('#artedu-thread-prompt').fill(item.prompt);await page.getByRole('button',{name:'发送',exact:true}).click();
  await page.getByRole('button',{name:'重新输出',exact:true}).waitFor({state:'visible',timeout:15000});
  await page.locator('.ai-message--streaming').waitFor({state:'detached',timeout:15000});
  const body=await page.locator('.ai-message--assistant').last().innerText();assert.ok(body.includes('执行进度'));assert.ok(!body.includes('harness_probe'));
  if(item.status==='partial')assert.ok(body.includes('部分完成'));if(item.status==='paused')assert.ok(body.includes('已暂停'));
  if(item.id===11){assert.ok(body.includes('视觉内容待核验'));assert.ok(body.includes('AI生成图片'));assert.equal(await page.locator('.agent-artifact img').count(),1);await page.waitForFunction(()=>document.querySelector('.agent-artifact img')?.naturalWidth>0);}
  const count=await page.locator('.agent-artifact').count();assert.equal(count,item.delivery?.artifacts?.length||0);assert.deepEqual(errors,[]);
  if([3,5,7,8,11].includes(item.id))await page.screenshot({path:path.join(out,'ui-case'+item.id+'.png')});
  await page.setViewportSize({width:390,height:844});const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);assert.equal(overflow,false);if(item.id===11)await page.screenshot({path:path.join(out,'ui-image-mobile.png')});
  cases.push({id:item.id,passed:true,status:item.status,artifactCards:count,mobileNoOverflow:!overflow});console.log(JSON.stringify(cases.at(-1)));await context.close();
 }
 const result={mode:'actual React workspace, replaying actual Harness fixtures, no API calls',cases};fs.writeFileSync(path.join(out,'ui-results.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({tests:cases.length,passed:cases.filter(c=>c.passed).length}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
