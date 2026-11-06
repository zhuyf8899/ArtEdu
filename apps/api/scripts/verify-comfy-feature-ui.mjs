import assert from 'node:assert/strict';
import http from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
const root=path.resolve('../../admin-console/dist/client');
const server=http.createServer(async(req,res)=>{try{let file=path.join(root,new URL(req.url,'http://localhost').pathname);if(!path.extname(file))file=path.join(root,'index.html');if(!file.startsWith(root+path.sep))throw Error('Invalid path');const body=await readFile(file);res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2','.png':'image/png','.jpg':'image/jpeg'})[path.extname(file)]||'application/octet-stream');res.end(body);}catch{res.statusCode=404;res.end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await puppeteer.launch({executablePath:process.env.AGENT_BROWSER_EXECUTABLE||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--disable-extensions','--disable-background-networking']});
let enabled=true;const errors=[];const page=await browser.newPage();await page.setViewport({width:1440,height:1080});page.on('pageerror',e=>errors.push(e.message));await page.setRequestInterception(true);
page.on('request',async request=>{const endpoint=new URL(request.url()).pathname;if(!endpoint.startsWith('/api/'))return request.continue();
 let response={items:[]};
 if(endpoint==='/api/auth/me')response={id:'qa-admin',displayName:'测试管理员',username:'qa',roles:['admin']};
 if(endpoint==='/api/platform/comfyui-feature')response={enabled};
 if(endpoint==='/api/admin/comfyui-feature'){enabled=JSON.parse(request.postData()).enabled;response={enabled};}
 if(endpoint==='/api/admin/dashboard')response={activeModels:0};
 if(endpoint==='/api/portal/home')response={courses:[],workflows:[],works:[],creation:{enabled:false,models:[],quota:{}}};
 if(endpoint==='/api/admin/tool-directory-links'||endpoint==='/api/tool-directory-links')response={items:[{id:'tool-directory-workflow',name:'节点生图',category:'AI',href:'/studio?builder=1',status:'active'},{id:'external-demo',name:'外部设计工具',detail:'工具示例',category:'AI',href:'https://example.com',status:'active'}]};
 await request.respond({status:200,contentType:'application/json',body:JSON.stringify(response)});
});
const base='http://127.0.0.1:'+server.address().port;
const output=path.resolve('data/qa/comfy-feature');await mkdir(output,{recursive:true});
try{
 await page.goto(base+'/admin/workflows',{waitUntil:'networkidle0'});
 const toggle=await page.waitForSelector('[role=switch][aria-label="启用节点生图（ComfyUI）"]');
 await page.waitForFunction(()=>document.querySelector('[role=switch]')?.getAttribute('aria-checked')==='true');
 await toggle.click();await page.waitForFunction(()=>document.querySelector('[role=switch]')?.getAttribute('aria-checked')==='false');
 assert.equal(await page.$('.workflow-admin-panel'),null);assert.ok(await page.$('.workflow-feature-control'));
 await page.screenshot({path:path.join(output,'disabled-desktop.png')});
 await page.setViewport({width:390,height:844});await new Promise(resolve=>setTimeout(resolve,350));assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 await page.screenshot({path:path.join(output,'disabled-mobile.png')});
 await toggle.click();await page.waitForFunction(()=>document.querySelector('[role=switch]')?.getAttribute('aria-checked')==='true');
 await page.waitForSelector('.workflow-admin-panel');
 await toggle.click();await page.waitForFunction(()=>document.querySelector('[role=switch]')?.getAttribute('aria-checked')==='false');
 await page.goto(base+'/studio?builder=1',{waitUntil:'networkidle0'});
 assert.equal(await page.$('.workflow-catalog__list'),null);assert.equal(await page.$('.workflow-admin-panel'),null);
 assert.ok((await page.content()).includes('外部设计工具'));assert.ok(!(await page.content()).includes('管理与新建工作流'));
 assert.deepEqual(errors,[]);console.log('PASS: admin toggle off/on, editor unmounted, mobile layout, direct builder blocked and external tools preserved (mock API only).');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
