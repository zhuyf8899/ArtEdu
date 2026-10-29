import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const root=path.resolve(import.meta.dirname,'..'),out=path.join(root,'outputs/workflow-unification');await mkdir(out,{recursive:true});
const api=createRequire(path.join(root,'apps/api/package.json'));
const {createServer}=await import(pathToFileURL(path.join(root,'admin-console/node_modules/vite/dist/node/index.js')));
const server=await createServer({root:path.join(root,'admin-console'),server:{host:'127.0.0.1',port:0,hmr:false},logLevel:'error'});await server.listen();
const browser=await api('puppeteer-core').launch({headless:true,executablePath:process.env.ARTEDU_BROWSER_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const checks=[],errors=[];
try {
 const page=await browser.newPage();globalThis.qaPage=page;page.on('pageerror',e=>errors.push(e.message));await page.setViewport({width:1440,height:1000});
 await page.setRequestInterception(true);page.on('request',req=>{
  if(!req.url().includes('/api/'))return void req.continue();
  const items=Array.from({length:25},(_,i)=>({id:`run-${i}`,workflowId:'qa-unified',status:'completed',versionNumber:1,currentStep:3,totalSteps:3,updatedAt:new Date(2026,9,25,12,i).toISOString()}));
  void req.respond({status:200,contentType:'application/json',body:JSON.stringify({items})});
 });
 const click=async text=>page.evaluate(text=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===text);if(!b)throw Error(`Missing ${text}`);b.click();},text);
 await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/tests/fixtures/workflow-unified.html`);await page.waitForSelector('.workflow-flow-node');
 await page.waitForFunction(()=>document.querySelectorAll('.react-flow__node').length===3);
 await page.evaluate(()=>document.querySelector('[title="按连接关系自动整理节点"]').click());
 await page.waitForFunction(()=>window.unifiedGraph.nodes[1].position.x>300);
 const layout=await page.evaluate(()=>window.unifiedGraph.nodes.map(n=>({id:n.id,...n.position})));assert.equal(layout.length,3);checks.push('shared-platform-canvas-and-measured-layout');
 await page.waitForFunction(()=>{const g=document.querySelector('.workflow-canvas-group');const n=document.querySelector('[data-id="循环润色"]');return g&&n&&g.getBoundingClientRect().bottom>=n.getBoundingClientRect().bottom;},{timeout:5000});checks.push('group-encloses-actual-tall-loop-node');
 await page.screenshot({path:path.join(out,'unified-desktop.png'),fullPage:true});
 await click('历史');await page.waitForSelector('.workflow-run-history__list article');assert.equal(await page.$$eval('.workflow-run-history__list article',n=>n.length),20);
 await click('加载更早记录（还有 5 条）');assert.equal(await page.$$eval('.workflow-run-history__list article',n=>n.length),25);checks.push('history-opens-runs-after-twentieth');
 await click('参数配置');
 await page.evaluate(()=>{const nodes=Array.from({length:80},(_,i)=>({id:`n${i}`,type:'text_constant',position:{x:i*350,y:0},data:{label:`节点${i}`,value:'文字'}}));window.setUnifiedGraph({schemaVersion:2,nodes,edges:[],groups:[]});});
 await page.waitForFunction(()=>window.unifiedGraph.nodes.length===80);
 await page.evaluate(()=>document.querySelector('[data-id="n0"] .workflow-flow-node').click());await page.keyboard.down('Control');await page.keyboard.press('d');await page.keyboard.up('Control');
 assert.equal(await page.evaluate(()=>window.unifiedGraph.nodes.length),80);assert.ok(await page.evaluate(()=>window.notices.some(n=>n.includes('80'))));checks.push('duplicate-blocked-at-eighty-nodes');
 await click('节点库');await page.evaluate(()=>document.querySelector('.workflow-node-list button').click());assert.equal(await page.evaluate(()=>window.unifiedGraph.nodes.length),80);checks.push('ordinary-add-blocked-at-eighty-nodes');
 await page.setViewport({width:390,height:844});await page.screenshot({path:path.join(out,'unified-mobile.png'),fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));checks.push('mobile-no-horizontal-overflow');
 assert.deepEqual(errors,[]);checks.push('no-browser-runtime-errors');
 await writeFile(path.join(out,'browser-report.json'),JSON.stringify({passed:checks.length,checks,errors},null,2));console.log(JSON.stringify({passed:checks.length,checks},null,2));
}catch(e){if(globalThis.qaPage){console.log(JSON.stringify(await qaPage.evaluate(()=>({group:document.querySelector('.workflow-canvas-group')?.getBoundingClientRect().toJSON(),nodes:[...document.querySelectorAll('.react-flow__node')].map(n=>({id:n.dataset.id,rect:n.getBoundingClientRect().toJSON(),style:n.getAttribute('style'),html:n.innerHTML.slice(0,300)})),graph:window.unifiedGraph,errors:document.body.innerText.slice(-1000)})),null,2));await qaPage.screenshot({path:path.join(out,'failure.png'),fullPage:true});}throw e;}finally{await browser.close();await server.close();}
