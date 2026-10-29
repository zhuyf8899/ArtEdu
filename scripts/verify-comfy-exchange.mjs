import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const root=path.resolve(import.meta.dirname,'..'),output=path.join(root,'outputs/comfy-exchange-qa');await mkdir(output,{recursive:true});
const api=createRequire(path.join(root,'apps/api/package.json'));
const {createServer}=await import(pathToFileURL(path.join(root,'admin-console/node_modules/vite/dist/node/index.js')));
const server=await createServer({root:path.join(root,'admin-console'),server:{host:'127.0.0.1',port:0},logLevel:'error'});await server.listen();
const browser=await api('puppeteer-core').launch({headless:true,executablePath:process.env.ARTEDU_BROWSER_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.setViewport({width:1440,height:1000});
 let online=false,started=0;
 const catalog={OfflineSource:{input:{required:{text:['STRING',{default:''}]}},output:['IMAGE']},SaveImage:{input:{required:{images:['IMAGE',{}],filename_prefix:['STRING',{default:'test'}]}},output:[],output_node:true}};
 await page.setRequestInterception(true);page.on('request',req=>{
  if(!req.url().includes('/api/'))return void req.continue();
  let body={items:[]};
  if(req.url().includes('/catalog'))body={nodes:online?catalog:{},workers:online?[{id:'isolated-worker'}]:[]};
  else if(req.url().includes('/comfy/jobs/'))body={runId:'native-qa-run',status:'completed',artifacts:[],progress:{}};
  else if(req.url().includes('/workflows/offline-qa/runs')){started++;body={id:'native-qa-run'};}
  void req.respond({status:200,contentType:'application/json',body:JSON.stringify(body)});
 });
 const cdp=await page.createCDPSession();await cdp.send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:output});
 await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/tests/fixtures/comfy-exchange.html`);await page.waitForSelector('input[type=file]');
 const raw={version:1,state:{lastNodeId:2,lastLinkId:5},nodes:[{id:1,type:'OfflineSource',title:'测试输入',pos:[0,0],size:[280,180],flags:{},mode:0,order:0,properties:{plugin:'keep'},widgets_values:{text:'花鸟'},inputs:[],outputs:[{name:'IMAGE',type:'IMAGE',links:[5]}]},{id:2,type:'SaveImage',pos:[350,0],size:[280,180],flags:{},mode:0,order:1,properties:{},widgets_values:{filename_prefix:'test'},inputs:[{name:'images',type:'IMAGE',link:5}],outputs:[]}],links:[{id:5,origin_id:1,origin_slot:0,target_id:2,target_slot:0,type:'IMAGE'}],groups:[{title:'导入分组',bounding:[-20,-30,700,300],color:'#123456'}],extra:{ds:{scale:.8,offset:[50,100]}}};
 const filename=path.join(output,'source.json');await writeFile(filename,JSON.stringify(raw));await (await page.$('input[type=file]')).uploadFile(filename);await page.waitForFunction(()=>window.exchangeFixture?.nodes[0]?.data.classType==='OfflineSource');
 const click=async name=>page.evaluate(text=>{const b=[...document.querySelectorAll('button')].find(n=>n.textContent.trim()===text);if(!b)throw Error(`Missing button ${text}`);b.click();},name);
 const download=async(name,file)=>{await click(name);for(let i=0;i<40;i++){try{return JSON.parse(await readFile(path.join(output,file),'utf8'));}catch{await new Promise(r=>setTimeout(r,100));}}throw Error('Download timeout '+file);};
 const ui=await download('导出 ComfyUI 0.4','comfy-ui-0.4.json');assert.equal(ui.version,.4);assert.equal(ui.nodes[0].properties.plugin,'keep');assert.deepEqual(ui.links,[[5,1,0,2,0,'IMAGE']]);
 const modern=await download('导出 ComfyUI 1.0','comfy-ui-1.json');assert.equal(modern.version,1);assert.equal(modern.links[0].target_id,2);
 const prompt=await download('导出 API JSON','comfy-api-workflow.json');assert.equal(prompt['1'].inputs.text,'花鸟');assert.deepEqual(prompt['2'].inputs.images,['1',0]);
 const backup=await download('导出 JSON','comfy-canvas.json');assert.ok(backup.definition.comfyExchange.source);assert.deepEqual(errors,[]);
 assert.equal(await page.$eval('.workflow-canvas-run-top',b=>b.disabled),true);
 online=true;await click('刷新 Worker');await page.waitForFunction(()=>!document.querySelector('.workflow-canvas-run-top').disabled);
 await page.$eval('.workflow-canvas-run-top',b=>b.click());await page.waitForFunction(()=>document.querySelector('.workflow-native-runtime')?.textContent.includes('运行完成'));assert.equal(started,1);
 await page.screenshot({path:path.join(output,'canvas.png'),fullPage:true});
 await writeFile(path.join(output,'browser-report.json'),JSON.stringify({imports:true,exports:['UI 0.4','UI 1.0','API','platform backup'],offlineRunDisabled:true,onlineRunStarted:started,errors},null,2));console.log('PASS: actual ComfyCanvas offline import; standard UI 0.4, UI 1.0, API and platform backup downloads; metadata, sockets, groups and no browser errors. Worker lifecycle mocked; no physical GPU or model calls.');
}finally{await browser.close();await server.close();}
