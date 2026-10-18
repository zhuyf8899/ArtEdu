// Isolated browser regression. Fixture metadata follows local nodes.py;
// this does not claim to execute a real ComfyUI server or modify platform data.
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {createComfyPreset} from '../admin-console/src/comfyPresets.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(path.join(root,'apps/api/package.json'));
const puppeteer=require('puppeteer-core');
const output=path.join(root,'local-artifacts/comfy-editor-qa');await mkdir(output,{recursive:true});
const info=(required,output=[],output_node=false)=>({input:{required},output,output_node});
const integer=(value,min=0,max=8192)=>['INT',{default:value,min,max}];
const catalog={
 CheckpointLoaderSimple:info({ckpt_name:[['fixture-checkpoint.safetensors']]},['MODEL','CLIP','VAE']),
 CLIPTextEncode:info({clip:['CLIP'],text:['STRING',{default:'',multiline:true}]},['CONDITIONING']),
 EmptyLatentImage:info({width:integer(512,16),height:integer(512,16),batch_size:integer(1,1,4096)},['LATENT']),
 KSampler:info({model:['MODEL'],seed:integer(0,0,Number.MAX_SAFE_INTEGER),steps:integer(20,1,10000),cfg:['FLOAT',{default:8,min:0,max:100}],sampler_name:[['euler']],scheduler:[['normal']],positive:['CONDITIONING'],negative:['CONDITIONING'],latent_image:['LATENT'],denoise:['FLOAT',{default:1,min:0,max:1}]},['LATENT']),
 VAEDecode:info({samples:['LATENT'],vae:['VAE']},['IMAGE']),
 SaveImage:info({images:['IMAGE'],filename_prefix:['STRING',{default:'ComfyUI'}]},[],true)
};
let serial=0,definition=createComfyPreset('text',catalog,()=>String(++serial));
const workflow=()=>({id:'qa-native',name:'画布交互验收',description:'isolated fixture',category:'GPU',entryType:'workbench',status:'draft',createdBy:'qa',creatorName:'QA',versions:[{id:'v1',definition,versionNumber:1,published:false}]});
const saved=[],errors=[];
const dist=path.join(root,'admin-console/dist/client');
const server=createServer(async(req,res)=>{try{const rel=decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\//,'');let file=path.resolve(dist,rel||'index.html');if(!file.startsWith(dist+path.sep))throw new Error('invalid path');let bytes;try{bytes=await readFile(file);}catch{file=path.join(dist,'index.html');bytes=await readFile(file);}res.setHeader('content-type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'application/octet-stream');res.end(bytes);}catch{res.writeHead(404);res.end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try{
 browser=await puppeteer.launch({headless:true,executablePath:process.env.ARTEDU_BROWSER_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 const page=await browser.newPage();await page.setViewport({width:1440,height:1000});
 page.on('pageerror',error=>errors.push(error.message));await page.setRequestInterception(true);
 page.on('request',async request=>{
  const pathname=new URL(request.url()).pathname;if(!pathname.startsWith('/api/'))return request.continue();
  let body={items:[]};
  if(pathname==='/api/auth/me')body={id:'qa',displayName:'QA',roles:['admin']};
  else if(pathname==='/api/admin/workflows')body={items:[workflow()]};
  else if(pathname==='/api/admin/workflows/qa-native')body=workflow();
  else if(pathname==='/api/comfy/catalog')body={nodes:catalog,workers:[{id:'qa-worker'}]};
  else if(pathname==='/api/admin/dashboard')body={};
  else if(pathname==='/api/health')body={status:'ok'};
  else if(pathname==='/api/workflows/qa-native/versions'&&request.method()==='POST'){body=JSON.parse(request.postData());saved.push(body);definition=body.definition;body={id:'v2',versionNumber:2,published:false};}
  await request.respond({status:200,contentType:'application/json',body:JSON.stringify(body)});
 });
 const clickButton=async text=>{const handle=await page.waitForSelector(`::-p-text(${text})`);await handle.click();};
 await page.goto(`http://127.0.0.1:${server.address().port}/admin/workflows`);
 await clickButton('画布交互验收');await page.waitForSelector('.comfy-node');
 assert.equal(await page.$$eval('.comfy-node',nodes=>nodes.length),7);
 // Enumerated model/sampler widgets must not advertise unconnectable inputs.
 assert.equal(await page.$$eval('.comfy-node label',labels=>labels.filter(l=>l.querySelector('select')&&l.querySelector('.react-flow__handle')).length),0);
 const seed=await page.$('input[aria-label="seed"]');const before=await seed.evaluate(input=>input.value);
 await seed.click();await page.keyboard.down('Control');await page.keyboard.press('A');await page.keyboard.up('Control');await page.keyboard.press('Backspace');await seed.type('42');
 await clickButton('＋ 添加节点');await clickButton('撤销');assert.equal(await seed.evaluate(input=>input.value),before);
 await clickButton('重做');assert.equal(await seed.evaluate(input=>input.value),'42');
 // One drag is one undo; layout measurement and selection add no history.
 await clickButton('＋ 添加节点');
 const first=await page.$('.react-flow__node');const initial=await first.evaluate(n=>n.style.transform);const title=await first.$('strong');const box=await title.boundingBox();
 await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+60,box.y+box.height/2+50,{steps:12});await page.mouse.up();
 assert.notEqual(await first.evaluate(n=>n.style.transform),initial);await clickButton('＋ 添加节点');await clickButton('撤销');assert.equal(await first.evaluate(n=>n.style.transform),initial);
 // Copy captures the old value even after the original widget changes.
 const samplerTitle=await page.$('.react-flow__node:has(input[aria-label="seed"]) strong');
 const shortcut=async key=>{await page.keyboard.down('Control');await page.keyboard.press(key);await page.keyboard.up('Control');};
 await samplerTitle.click();await shortcut('c');await seed.click();await shortcut('a');await page.keyboard.press('Backspace');await seed.type('99');await samplerTitle.click();await shortcut('v');
 assert.equal(await page.$$eval('.comfy-node',nodes=>nodes.length),8);
 assert.deepEqual(await page.$$eval('input[aria-label="seed"]',inputs=>inputs.map(input=>input.value)),['99','42']);
 await clickButton('撤销');assert.equal(await page.$$eval('.comfy-node',nodes=>nodes.length),7);
 // Delete one required link, save incomplete draft, and reopen saved fixture.
 await clickButton('＋ 添加节点');
 const edge=await page.$('.react-flow__edge-interaction');await edge.click();await page.keyboard.press('Delete');
 // Reconnect the missing CLIP input using real handle gestures, then undo once.
 const checkpoint=await page.$('.react-flow__node:has(select[aria-label="ckpt_name"])');
 const sourceHandle=await checkpoint.$('.react-flow__handle.source[data-handleid="1"]');
 const targetHandle=await page.$('.react-flow__node[data-id="2"] .react-flow__handle.target[data-handleid="clip"]');
 const from=await sourceHandle.boundingBox(),to=await targetHandle.boundingBox();
 await page.mouse.move(from.x+from.width/2,from.y+from.height/2);await page.mouse.down();await page.mouse.move(to.x+to.width/2,to.y+to.height/2,{steps:10});await page.mouse.up();
 assert.equal(await page.$$eval('.react-flow__edge',edges=>edges.length),9);await clickButton('＋ 添加节点');await clickButton('撤销');assert.equal(await page.$$eval('.react-flow__edge',edges=>edges.length),8);await clickButton('＋ 添加节点');
 await clickButton('保存');await page.waitForFunction(()=>[...document.querySelectorAll('.comfy-editor button')].some(button=>button.textContent==='保存'&&!button.disabled));
 assert.equal(saved.length,1);assert.equal(saved[0].publish,false);assert.equal(saved[0].definition.edges.length,8);assert.equal(saved[0].definition.comfyPrompt,undefined);
 assert(saved[0].definition.viewport.zoom>0);assert.notEqual(saved[0].definition.viewport.zoom,1);
 assert(await page.$eval('.react-flow__controls-button svg',svg=>svg.getBoundingClientRect().width>0));
 await page.screenshot({path:path.join(output,'desktop.png'),fullPage:true});
 await page.setViewport({width:390,height:844});await page.screenshot({path:path.join(output,'mobile.png'),fullPage:true});
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.deepEqual(errors,[]);
 const report={mode:'isolated-fixture',nodes:7,enumHandles:false,undoParameter:true,undoDrag:true,clipboardSnapshot:true,typedConnection:true,incompleteDraftSaved:true,viewportSaved:true,controlIconsVisible:true,errors};await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
