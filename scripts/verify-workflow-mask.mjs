import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const root=path.resolve(import.meta.dirname,'..');
const api=createRequire(path.join(root,'apps/api/package.json'));
const {createServer}=await import(pathToFileURL(path.join(root,'admin-console/node_modules/vite/dist/node/index.js')));
const server=await createServer({root:path.join(root,'admin-console'),server:{host:'127.0.0.1',port:0},logLevel:'error'});
await server.listen();
const browser=await api('puppeteer-core').launch({headless:true,executablePath:process.env.ARTEDU_BROWSER_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
try{
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setViewport({width:1000,height:1000});
 await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/tests/fixtures/workflow-image-input.html`);
 await page.waitForSelector('input[type=file]');
 // Real browser encodes an opaque original, then the same UI used in both runners handles it.
 const source=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=320;c.height=180;const x=c.getContext('2d');x.fillStyle='#27608d';x.fillRect(0,0,320,180);return c.toDataURL();});
 await mkdir(path.join(root,'outputs'),{recursive:true});const original=path.join(root,'outputs/workflow-mask-original.png');await writeFile(original,Buffer.from(source.split(',')[1],'base64'));
 const input=await page.$('input[type=file]');await input.uploadFile(original);
 await page.waitForSelector('canvas');
 const canvas=await page.$('canvas');const box=await canvas.boundingBox();
 await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width*.6,box.y+box.height/2,{steps:5});await page.mouse.up();
 assert.equal(await page.evaluate(()=>window.maskFixture.maskPending),true);
 const click=async text=>{await page.evaluate(t=>[...document.querySelectorAll('button')].find(b=>b.textContent===t)?.click(),text);};
 await click('应用遮罩');await page.waitForFunction(()=>window.maskFixture?.maskFile&&!window.maskFixture.maskPending);
 const inspect=()=>page.evaluate(async()=>{const b=await createImageBitmap(window.maskFixture.maskFile);const c=document.createElement('canvas');c.width=b.width;c.height=b.height;const x=c.getContext('2d');x.drawImage(b,0,0);const result={width:b.width,height:b.height,center:x.getImageData(160,90,1,1).data[3],corner:x.getImageData(0,0,1,1).data[3]};b.close();return result;});
 assert.deepEqual(await inspect(),{width:320,height:180,center:0,corner:255});
 await click('反选');await click('应用遮罩');await page.waitForFunction(()=>window.maskFixture?.maskFile&&!window.maskFixture.maskPending);
 assert.deepEqual(await inspect(),{width:320,height:180,center:255,corner:0});
 await click('撤销');await click('应用遮罩');await page.waitForFunction(()=>window.maskFixture?.maskFile&&!window.maskFixture.maskPending);assert.equal((await inspect()).center,0);
 await click('清空');assert.equal(await page.evaluate(()=>window.maskFixture.maskFile),null);
 await page.setViewport({width:390,height:900});await page.screenshot({path:path.join(root,'outputs/workflow-mask-mobile.png'),fullPage:true});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
 assert.deepEqual(errors,[]);console.log('PASS: upload/PNG normalization, paint, transparent edit region, original dimensions, invert, undo, clear, 390px layout, no page errors. No model requests.');
}finally{await browser.close();await server.close();}
