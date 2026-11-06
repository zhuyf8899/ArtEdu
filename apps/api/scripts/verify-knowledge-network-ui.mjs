import assert from 'node:assert/strict';import http from 'node:http';import {readFile,mkdir} from 'node:fs/promises';import path from 'node:path';import puppeteer from 'puppeteer-core';
const root=path.resolve('../../admin-console/dist/client'),output=path.resolve('data/qa/knowledge-network');const graph=JSON.parse(await readFile(path.join(output,'network-fixture.json'),'utf8'));await mkdir(output,{recursive:true});
const server=http.createServer(async(req,res)=>{try{let file=path.join(root,new URL(req.url,'http://localhost').pathname);if(!path.extname(file))file=path.join(root,'index.html');if(!file.startsWith(root+path.sep))throw Error('Invalid path');res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2','.png':'image/png','.jpg':'image/jpeg'})[path.extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.statusCode=404;res.end();}});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await puppeteer.launch({executablePath:process.env.AGENT_BROWSER_EXECUTABLE||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--disable-extensions','--disable-background-networking']});const page=await browser.newPage();await page.setViewport({width:1440,height:1100});const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.setRequestInterception(true);
page.on('request',async request=>{const endpoint=new URL(request.url()).pathname;if(!endpoint.startsWith('/api/'))return request.continue();let response={items:[],total:0,facets:{}};
 if(endpoint==='/api/auth/me')response={id:'qa-network',username:'qa-network',displayName:'知识网络验证',roles:['admin']};
 if(endpoint==='/api/platform/comfyui-feature')response={enabled:true};
 if(endpoint==='/api/me/knowledge-network')response=graph;
 if(endpoint==='/api/portal/home')response={courses:[],workflows:[],works:[],creation:{enabled:false,models:[],quota:{}}};
 if(endpoint==='/api/me/learning-space')response={profile:{id:'qa-network',displayName:'知识网络验证',roles:['admin']},summary:{completedLessons:0,totalLessons:0},courses:[],learningLessons:[],tasks:[],notes:[],works:[],favorites:[],workflowRuns:[]};
 await request.respond({status:200,contentType:'application/json',body:JSON.stringify(response)});
});
const base='http://127.0.0.1:'+server.address().port;
try{
 await page.goto(base+'/my-learning?view=knowledge',{waitUntil:'networkidle0'});await page.waitForSelector('.kn-node');assert.equal((await page.$$('.kn-node')).length,30);
 assert.equal((await page.$$('.kn-edge')).length,54);assert.equal((await page.$$('.kn-tag-dot')).length,12);
 await page.click('g[aria-label="查看知识点 用户观察"]');assert.ok((await page.$eval('.kn-detail',el=>el.textContent)).includes('研究方法'));assert.ok((await page.$$('.kn-edge.is-active')).length>=2);
 await page.type('input[aria-label="搜索知识节点"]','用户观察');assert.equal((await page.$$('.kn-node:not(.is-muted)')).length,1);
 await page.click('.kn-note button');await page.select('select[aria-label="筛选知识标签"]','验证');assert.equal((await page.$$('.kn-node:not(.is-muted)')).length,2);await page.select('select[aria-label="筛选知识标签"]','');
 await page.waitForFunction(()=>{const canvas=document.querySelector('.kn-canvas').getBoundingClientRect();return [...document.querySelectorAll('.kn-node')].every(node=>{const box=node.getBoundingClientRect();return box.left>=canvas.left&&box.right<=canvas.right+1&&box.top>=canvas.top&&box.bottom<=canvas.bottom+1;});});
 await page.screenshot({path:path.join(output,'network-desktop.png'),fullPage:true});await (await page.$('.knowledge-network')).screenshot({path:path.join(output,'network-preview.png')});
 await page.setViewport({width:390,height:844});await new Promise(resolve=>setTimeout(resolve,350));assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.ok(await page.$eval('.morph-space-name',el=>el.getBoundingClientRect().width>=120));assert.ok(await page.$eval('.morph-space-profile',el=>el.getBoundingClientRect().height<300));await page.screenshot({path:path.join(output,'network-mobile.png'),fullPage:true});
 await page.setViewport({width:1440,height:1000});await page.goto(base+'/learning?library=courses',{waitUntil:'networkidle0'});assert.equal(await page.$('.kn-node'),null);
 await page.click('button[aria-controls="learning-network-content"]');await page.waitForSelector('.kn-node');assert.equal((await page.$$('.kn-node')).length,30);
 const reference=await page.$('button::-p-text(课程参考总览)');await reference.click();await page.waitForSelector('.atomic-reference-scope');assert.equal(await page.$('.kn-node'),null);
 assert.deepEqual(errors,[]);console.log('PASS: 30 nodes / 54 edges / 12 tags; node selection, neighbors, search, tags, mobile bounds, collapsed course entry and preserved reference UI.');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
