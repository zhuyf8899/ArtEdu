import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const root=path.resolve(import.meta.dirname,'..');
const api=createRequire(path.join(root,'apps/api/package.json'));
const {createServer}=await import(pathToFileURL(path.join(root,'admin-console/node_modules/vite/dist/node/index.js')));
const server=await createServer({root:path.join(root,'admin-console'),server:{host:'127.0.0.1',port:0},logLevel:'error'});await server.listen();
const browser=await api('puppeteer-core').launch({headless:true,executablePath:process.env.ARTEDU_BROWSER_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
try{
 const page=await browser.newPage(),errors=[],requests=[];let remote,executeCalls=0,saveCalls=0;
 page.on('pageerror',e=>errors.push(e.message));await page.setRequestInterception(true);
 page.on('request',async request=>{
  if(!request.url().includes('/api/'))return request.continue();
  const url=new URL(request.url()),method=request.method();requests.push(`${method} ${url.pathname}`);
  let status=200,body;
  if(url.pathname.endsWith('/restore')){remote={...JSON.parse(request.postData()),changeSummary:'已从本机恢复',execution:null};body=remote;}
  else if(url.pathname.endsWith('/execute')){executeCalls++;remote.execution={id:'execution',revision:1,status:'completed',completedNodes:['text','out'],text:'本机正文',artifacts:[]};body=remote;}
  else if(url.pathname.endsWith('/save-draft')){saveCalls++;body=remote;}
  else if(method==='DELETE'){remote=undefined;body={ok:true};}
  else if(remote)body=remote;else{status=404;body={message:'临时工作流已清理'};}
  await request.respond({status,contentType:'application/json',body:JSON.stringify(body)});
 });
 const url=`http://127.0.0.1:${server.httpServer.address().port}/tests/fixtures/temporary-workflow.html`;
 await page.goto(url);await page.waitForSelector('.temporary-workflow-card strong');
 assert.equal(requests.length,0,'viewing local drafts must not contact cloud');
 const click=async text=>page.evaluate(t=>[...document.querySelectorAll('button')].find(b=>b.textContent===t)?.click(),text);
 await click('查看节点图与参数');await page.waitForSelector('.react-flow');
 await page.reload();await page.waitForSelector('.temporary-workflow-card strong');assert.equal(requests.length,0);
 await click('确认执行此版本');await page.waitForFunction(()=>document.body.textContent.includes('执行完成'));
 assert.equal(executeCalls,1);assert.equal(saveCalls,0);assert.equal(requests.filter(x=>x.includes('/restore')).length,1);
 await page.reload();await page.waitForFunction(()=>document.body.textContent.includes('本机正文'));assert.equal(executeCalls,1);
 // Binary local results survive reload without consulting expired cloud URLs.
 await page.evaluate(async()=>{const snapshot=await window.workflowStore.getLocalWorkflow('qa',window.initialWorkflow.id);await window.workflowStore.saveLocalWorkflowFile('qa',snapshot.snapshot.id,'artifact',new Blob(['local result'],{type:'text/plain'}));snapshot.snapshot.execution.artifacts=[{id:'artifact',fileName:'result.txt',mimeType:'text/plain',downloadUrl:'/api/temporary-workflows/expired/assets/artifact'}];await window.workflowStore.saveLocalWorkflow('qa','conversation',snapshot.snapshot);});
 await page.waitForSelector('a[download="result.txt"]');const before=requests.length;
 await page.reload();await page.waitForSelector('a[download="result.txt"]');assert.equal(requests.length,before);
 remote=await page.evaluate(async()=>(await window.workflowStore.getLocalWorkflow('qa',window.initialWorkflow.id)).snapshot);
 await click('保存正式草稿（云端）');await page.waitForFunction(()=>!document.querySelector('.temporary-workflow-actions button').disabled);assert.equal(saveCalls,1);
 await click('清理云端临时副本');await page.waitForFunction(()=>!document.querySelector('.temporary-workflow-actions button').disabled);
 const afterClear=requests.length;await page.reload();await page.waitForSelector('a[download="result.txt"]');assert.equal(requests.length,afterClear);assert.equal(remote,undefined);
 await page.setViewport({width:390,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 assert.deepEqual(errors,[]);console.log('PASS: local persistence, zero cloud requests on viewing, explicit execution only, expired graph restore, no implicit formal save, local result reload, 390px layout. No model calls.');
}finally{await browser.close();await server.close();}
