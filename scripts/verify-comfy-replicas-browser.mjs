import {createRequire} from 'node:module';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=path.resolve('data/comfy-workflow-library'),out=path.resolve('outputs/comfy-replication-20261026');await mkdir(out,{recursive:true});
const manifest=JSON.parse(await readFile(path.join(root,'manifest.json'),'utf8')),installed=JSON.parse(await readFile(path.join(root,'installed.json'),'utf8'));
const require=createRequire(path.resolve('apps/api/package.json'));
const readiness=await fetch('http://127.0.0.1:4000/api/health');if(readiness.status===429){const wait=Math.min(60000,Math.max(1000,Number(readiness.headers.get('retry-after')||60)*1000));console.log(`Respecting API Retry-After: ${wait}ms`);await new Promise(r=>setTimeout(r,wait));}
const browser=await require('puppeteer-core').launch({headless:true,executablePath:process.env.ARTEDU_BROWSER_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const results=[],errors=[];let modelRequests=0,page;
try{
 page=await browser.newPage();await page.setViewport({width:1920,height:1200});page.on('pageerror',e=>errors.push(e.message));
 page.on('request',r=>{if(r.method()==='POST'&&(/\/execute$/.test(r.url())||/\/runs$/.test(r.url())))modelRequests++;});
 await page.goto('http://localhost:4173/');
 assert.equal(await page.evaluate(async credentials=>(await fetch('/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(credentials)})).status,{username:process.env.ARTEDU_TEST_ADMIN_USERNAME || 'admin.demo',password:process.env.ARTEDU_TEST_ADMIN_PASSWORD || '123456'}),201);
 const cdp=await page.createCDPSession();
 for(const record of manifest.cases){
  const original=JSON.parse(await readFile(path.join(root,'originals',path.basename(record.sourcePath)),'utf8'));
  if(results.length===0)await page.goto(installed[record.id].url);else await page.evaluate(url=>{history.pushState(null,'',url);dispatchEvent(new PopStateEvent('popstate'));},installed[record.id].url);
  await page.waitForFunction(title=>document.querySelector('.workflow-canvas-topbar h1')?.textContent.includes(title),{},record.title);await page.waitForSelector('.comfy-node');
  await page.waitForFunction(count=>document.querySelectorAll('.comfy-node').length===count,{},record.nodes);
  await page.waitForFunction(()=>[...document.querySelectorAll('.react-flow__node')].every(n=>getComputedStyle(n).visibility==='visible'));
  const actual=await page.evaluate(()=>({nodes:document.querySelectorAll('.comfy-node').length,links:document.querySelectorAll('.react-flow__edge').length,groups:document.querySelectorAll('.workflow-canvas-group').length,widgets:document.querySelectorAll('.comfy-original-widget').length,collapsed:document.querySelectorAll('.comfy-node.is-collapsed').length,bypassed:document.querySelectorAll('.comfy-node.is-bypassed').length}));
  assert.equal(actual.nodes,record.nodes);assert.equal(actual.links,record.links);assert.equal(actual.groups,record.groups);
  assert.equal(actual.widgets,original.nodes.reduce((sum,n)=>sum+(Array.isArray(n.widgets_values)?n.widgets_values.length:0),0));
  assert.equal(actual.collapsed,original.nodes.filter(n=>n.flags?.collapsed).length);assert.equal(actual.bypassed,original.nodes.filter(n=>n.mode).length);
  const positions=await page.evaluate(()=>[...document.querySelectorAll('.react-flow__node')].map(n=>({id:n.dataset.id,transform:n.style.transform,width:n.getBoundingClientRect().width,height:n.getBoundingClientRect().height})));
  for(const n of original.nodes){const shown=positions.find(p=>p.id===String(n.id));const position=shown.transform.match(/translate\(([-\d.e]+)px, ([-\d.e]+)px\)/);assert.ok(position && Math.abs(Number(position[1])-n.pos[0])<.02 && Math.abs(Number(position[2])-n.pos[1])<.02,`${record.id}:${n.id} original position: ${shown.transform}`);}
  const folder=path.join(out,record.id,String(Date.now()));await mkdir(folder,{recursive:true});await cdp.send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:folder});
  await page.evaluate(()=>[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='导出 ComfyUI 0.4').click());
  let exported;for(let tries=0;tries<60;tries++){try{exported=JSON.parse(await readFile(path.join(folder,'comfy-ui-0.4.json'),'utf8'));break;}catch{await new Promise(r=>setTimeout(r,100));}}
  assert.deepEqual(exported,original,record.id+' UI download matches source');
  await page.screenshot({path:path.join(out,record.id+'.png'),fullPage:true});
  results.push({id:record.id,title:record.title,...actual,positionsExact:true,exportedFieldsExact:true,screenshot:path.join(out,record.id+'.png')});console.log(JSON.stringify(results.at(-1)));
 }
 assert.equal(modelRequests,0);assert.deepEqual(errors,[]);
 await page.evaluate(()=>fetch('/api/auth/logout',{method:'POST',headers:{'content-type':'application/json'},body:'{}'}));
 await writeFile(path.join(out,'browser-report.json'),JSON.stringify({status:'passed',cases:results,errors,modelRequests},null,2));
}catch(error){if(page)await page.screenshot({path:path.join(out,'failure.png'),fullPage:true});await writeFile(path.join(out,'browser-failure.json'),JSON.stringify({message:error.message,cases:results,errors},null,2));throw error;}
finally{await browser.close();}
