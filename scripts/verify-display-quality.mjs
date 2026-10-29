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
for(const [file,name] of [['cosmosEffect','mountMorphCosmos'],['atomicEffect','mountAtomic'],['networkEffect','mountNetwork']]){
await page.evaluate(async({file,name})=>{
window.cleanup?.();document.body.innerHTML=`<main style="width:1200px;height:700px;position:relative"><div id="effect-stage" style="width:1200px;height:700px"><canvas id="effect-canvas" style="width:1200px;height:700px"></canvas></div><canvas id="universe"></canvas><canvas id="word-dust"></canvas><h1 id="hero-title"><span id="title-line-1"></span><span id="title-line-2"></span></h1><button id="scene-next"></button><div class="floating-words"><span></span></div></main>`;
window.q=await import('/src/morph/displayQuality.js');window.q.setQualityMode('high');
const proto=CanvasRenderingContext2D.prototype; if(!window.instrumented){window.instrumented=true;const clear=proto.clearRect;proto.clearRect=function(...args){window.paints=(window.paints||0)+1;return clear.apply(this,args);};}
window.cleanup=(await import('/src/morph/'+file+'.js'))[name](document.querySelector('main'));
},{file,name});
for(const mode of ['high','balanced','light']){
await page.evaluate(mode=>{window.q.setQualityMode(mode);window.paints=0;},mode);
await new Promise(r=>setTimeout(r,200)); await page.evaluate(()=>window.paints=0);
await new Promise(r=>setTimeout(r,1100));
const state=await page.evaluate(()=>({tier:document.querySelector('main').dataset.displayQuality,paints:window.paints,width:document.querySelector('#universe').width}));
assert.equal(state.tier,mode);if(mode==='light')assert.equal(state.paints,0);else assert.ok(state.paints>0);results.push({effect:file,mode,...state});
}
await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);
await page.evaluate(()=>window.q.setQualityMode('high'));assert.equal(await page.$eval('main',e=>e.dataset.displayQuality),'light');
await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'no-preference'}]);
await page.evaluate(()=>window.cleanup());
}
await page.evaluate(()=>window.q.setQualityMode('balanced'));await page.reload();assert.equal(await page.evaluate(()=>localStorage.getItem('morph-display-quality')),'balanced');
assert.deepEqual(errors,[]);
await mkdir('local-artifacts/display-quality-qa',{recursive:true});await writeFile('local-artifacts/display-quality-qa/results.json',JSON.stringify({results,errors},null,2));console.log(JSON.stringify({results,errors},null,2));
} finally {await browser.close();server.kill();}


