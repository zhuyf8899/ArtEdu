import {spawn} from 'node:child_process';
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','4188'],{cwd:process.cwd()+'/admin-console',windowsHide:true,stdio:'inherit'});
await new Promise(r=>setTimeout(r,2500));
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const require=createRequire(new URL('../apps/api/package.json',import.meta.url));
const browser=await require('puppeteer-core').launch({headless:true,args:['--no-proxy-server'],executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
const results=[];
try {
await page.setViewport({width:1280,height:800,deviceScaleFactor:2});
await page.setRequestInterception(true); page.on('request',r=>r.isNavigationRequest()?r.respond({status:200,contentType:'text/html',body:'<html><body></body></html>'}):r.continue());
await page.goto('http://127.0.0.1:4188/quality-test');
await page.evaluate(()=>{document.body.innerHTML='<main></main>';});
const cdp=await page.createCDPSession();
for(const rate of [1,4,6]) {
 await cdp.send('Emulation.setCPUThrottlingRate',{rate});
 for(const mode of ['auto']) {
 await page.reload();
 await page.evaluate(async(mode)=>{
 Object.defineProperty(navigator,'hardwareConcurrency',{get:()=>16,configurable:true});
 Object.defineProperty(navigator,'deviceMemory',{get:()=>16,configurable:true});
 document.body.innerHTML=`<main style="width:1200px;height:700px"><canvas id="universe"></canvas><canvas id="word-dust"></canvas><h1 id="hero-title"><span id="title-line-1"></span><span id="title-line-2"></span></h1><button id="scene-next"></button><div class="floating-words"><span></span></div></main>`;
 window.q=await import('/src/morph/displayQuality.js');window.q.setQualityMode(mode);
 window.frames=[]; const proto=CanvasRenderingContext2D.prototype,clear=proto.clearRect;
 proto.clearRect=function(...args){if(this.canvas.id==='universe')window.frames.push(performance.now());return clear.apply(this,args);};
 window.cleanup=(await import('/src/morph/cosmosEffect.js')).mountMorphCosmos(document.querySelector('main'));
 window.tiers=[];window.track=setInterval(()=>window.tiers.push(document.querySelector('main').dataset.displayQuality),500);
 },mode);
 const before=await cdp.send('Performance.enable').then(()=>cdp.send('Performance.getMetrics'));
 await new Promise(r=>setTimeout(r,mode==='auto'?12000:4000));
 const after=await cdp.send('Performance.getMetrics');
 const state=await page.evaluate(()=>{const f=window.frames,d=f.slice(1).map((v,i)=>v-f[i]).sort((a,b)=>a-b);return {tier:document.querySelector('main').dataset.displayQuality,transitions:[...new Set(window.tiers)],frames:f.length,p50:d[Math.floor(d.length*.5)]||0,p95:d[Math.floor(d.length*.95)]||0};});
 const metric=(m,n)=>m.metrics.find(x=>x.name===n)?.value||0;
 const cpuSeconds=metric(after,'TaskDuration')-metric(before,'TaskDuration');
 results.push({cpuSlowdown:rate,mode,...state,cpuSeconds});
 console.log(JSON.stringify(results.at(-1)));
 if(mode==='light')assert.ok(state.frames<=2);
 await page.evaluate(()=>{clearInterval(window.track);window.cleanup();});
 }
}
assert.deepEqual(errors,[]);
await mkdir('local-artifacts/display-quality-qa',{recursive:true});await writeFile('local-artifacts/display-quality-qa/cpu-auto-retest.json',JSON.stringify({results,errors},null,2));
} finally {await browser.close();server.kill();}
