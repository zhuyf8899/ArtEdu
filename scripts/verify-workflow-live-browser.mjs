import {createRequire} from 'node:module';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const out=path.resolve(process.argv.find(a=>a.startsWith('--output='))?.slice(9) || 'outputs/workflow-live-20261025'),report=JSON.parse(await readFile(path.join(out,'report.json'),'utf8'));
const require=createRequire(path.resolve('apps/api/package.json'));
const browser=await require('puppeteer-core').launch({headless:true,executablePath:process.env.ARTEDU_BROWSER_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const errors=[],checks=[];let generationRequests=0;
try{
 const page=await browser.newPage();await page.setViewport({width:1440,height:1000});page.on('pageerror',e=>errors.push(e.message));
 page.on('request',r=>{if(r.method()==='POST'&&(/\/execute$/.test(r.url())||/\/runs$/.test(r.url())))generationRequests++;});
 await page.goto('http://localhost:4173/');
 const status=await page.evaluate(async credentials=>{const r=await fetch('/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(credentials)});return r.status;},{username:process.env.ARTEDU_TEST_ADMIN_USERNAME || 'admin.demo',password:process.env.ARTEDU_TEST_ADMIN_PASSWORD || '123456'});assert.equal(status,201);
 await page.goto(`http://localhost:4173/admin/workflows?edit=${encodeURIComponent(report.workflows?.[0] || report.workflowId)}`);await page.waitForSelector('.workflow-flow-node');
 await page.waitForFunction(()=>[...document.querySelectorAll('.react-flow__node')].every(n=>getComputedStyle(n).visibility==='visible'));
 await page.$eval('[title="按连接关系自动整理节点"]',b=>b.click());
 await page.evaluate(()=>[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='历史').click());
 await page.waitForSelector('.workflow-run-history__list article button');await page.$eval('.workflow-run-history__list article button',b=>b.click());
 await page.waitForFunction(()=>{const img=document.querySelector('.workflow-run-detail img');return img?.complete&&img.naturalWidth>0;});
 checks.push('real-persisted-workflow-opens-in-unified-editor','real-history-result-image-downloads-and-renders');
 await page.screenshot({path:path.join(out,'live-result-desktop.png'),fullPage:true});
 await page.setViewport({width:390,height:844});await page.waitForFunction(()=>document.documentElement.scrollWidth<=innerWidth+1);await page.screenshot({path:path.join(out,'live-result-mobile.png'),fullPage:true});checks.push('mobile-no-horizontal-overflow');
 assert.equal(generationRequests,0);assert.deepEqual(errors,[]);checks.push('review-does-not-submit-new-model-tasks','no-browser-runtime-errors');
 await page.evaluate(()=>fetch('/api/auth/logout',{method:'POST',headers:{'content-type':'application/json'},body:'{}'}));
 await writeFile(path.join(out,'browser-report.json'),JSON.stringify({status:'passed',checks,errors,generationRequests},null,2));console.log(JSON.stringify({status:'passed',checks,generationRequests}));
}finally{await browser.close();}
