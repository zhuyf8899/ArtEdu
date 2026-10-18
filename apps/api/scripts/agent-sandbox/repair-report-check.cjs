const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const {pathToFileURL}=require('url');
const {chromium}=require('C:/Users/24783/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const directory=path.resolve('local-artifacts/agent-sandbox-20261018/repair/round-3');
 const results=JSON.parse(fs.readFileSync(path.join(directory,'results.json'),'utf8'));
 const {presentation}=await import('./policy.mjs');const {renderView}=await import('./render.mjs');
 let views=0;
 for(const c of results.results)for(const t of c.turns||[]){const view=presentation(t.delivery,t.events);const html=renderView(view);assert.ok(html.includes(view.statusLabel));assert.ok(view.progress.filter(p=>p.kind==='run').every(p=>p.phase==='任务状态'));if(view.artifacts.some(a=>a.kind==='image')){assert.ok(html.includes('独立视觉复核通过'));assert.ok(html.includes('AI生成图片'));}views++;}
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(pathToFileURL(path.join(directory,'index.html')).href);assert.equal(await page.locator('body > section[id^="case"]').count(),11);assert.match(await page.locator('#case11 .artifact small').innerText(),/视觉复核通过/);
  const links=await page.locator('.artifact a').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('href')));for(const link of links)assert.ok(fs.existsSync(path.join(directory,link)),'Missing actual artifact: '+link);
  await page.screenshot({path:path.join(directory,'report-desktop.png')});await page.locator('#case8').screenshot({path:path.join(directory,'report-paused.png')});
  await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.deepEqual(errors,[]);
  const summary={cases:11,views,artifactLinks:links.length,allArtifactLinksExist:true,pausedVisible:true,imageVerificationLabel:true,mobileNoOverflow:true,errors};fs.writeFileSync(path.join(directory,'report-check.json'),JSON.stringify(summary,null,2));console.log(JSON.stringify(summary));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
