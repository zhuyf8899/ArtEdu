const fs=require('fs'),path=require('path');
const http=require('node:http');
const {chromium}=require('C:/Users/24783/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
exports.checkBrowser=async function(files,directory,kind){
 fs.mkdirSync(directory,{recursive:true});
 for(const [name,content] of files){if(path.isAbsolute(name)||name.split(/[\\/]/).includes('..'))throw Error('Invalid isolated test path');const p=path.join(directory,name);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,content);}
 const entry=files.find(f=>/index\.html?$/i.test(f[0]))||files.find(f=>/\.html?$/i.test(f[0]));
 if(!entry)return {passed:false,checks:{pageExists:false}};
 const root=path.resolve(directory);
 const server=http.createServer((req,res)=>{
  try{const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);const file=path.resolve(root,'.'+name);if(!file.startsWith(root+path.sep))throw Error('Invalid path');
   const mime={'.html':'text/html','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.json':'application/json'}[path.extname(file)]||'application/octet-stream';res.setHeader('content-type',mime+';charset=utf-8');res.end(fs.readFileSync(file));
  }catch{res.statusCode=404;res.end('Missing test asset');}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 const errors=[],checks={};
 try{
  const context=await browser.newContext({viewport:{width:1280,height:900}});
  await context.route(/^https?:/,r=>r.request().url().startsWith(origin+'/')?r.continue():r.abort());
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+'/'+entry[0].split(/[\\/]/).map(encodeURIComponent).join('/'),{waitUntil:'load',timeout:15000});
  checks.hasContent=(await page.locator('body').innerText()).trim().length>0;
  const invalidSvg=await page.evaluate(()=>[...document.querySelectorAll('svg [stop-color],svg [fill]')].flatMap(n=>['stop-color','fill'].filter(a=>n.hasAttribute(a)).map(a=>({attribute:a,value:n.getAttribute(a)}))).filter(({value})=>!/^url\(|^none$/.test(value)&&!CSS.supports('color',value)));
  checks.validSvgColors=invalidSvg.length===0;
  if(invalidSvg.length)errors.push('SVG颜色无效：'+JSON.stringify(invalidSvg.slice(0,4)));
  const detectedGallery=kind==='generic'&&await page.locator('article').count()>0&&await page.getByRole('button',{name:'全部',exact:true}).count()===1&&await page.getByRole('button',{name:'绘画',exact:true}).count()===1;
  if(kind==='gallery'||kind==='modify'||detectedGallery){
   const cards=page.locator('article,main [data-category]:not(button)');
   const visible=()=>cards.evaluateAll(nodes=>nodes.filter(n=>getComputedStyle(n).display!=='none'&&getComputedStyle(n).visibility!=='hidden'&&n.getBoundingClientRect().height>0).length);
   const n=await visible();if(detectedGallery)checks.hasWorks=n>0;else checks.sixWorks=n===6;
   const all=page.getByRole('button',{name:'全部',exact:true});
   const category=page.getByRole('button',{name:'绘画',exact:true});
   checks.filterButton=await category.count()===1;
   if(checks.filterButton){await category.click();const count=await visible();checks.filterActuallyChanges=count>0&&count<n;if(!checks.filterActuallyChanges)errors.push(`筛选点击后可见作品数量未减少：${n}->${count}；检查hidden是否被display:flex/grid覆盖，必须显式设置[hidden]{display:none!important}`);await all.click();checks.resetWorks=await visible()===n;}
   const detail=page.getByRole('button',{name:/详情|查看/}).first();
   if(await detail.count()){await detail.click();checks.detailsOpen=await page.locator('dialog:visible,[role="dialog"]:visible,.modal:visible').count()>0;await page.screenshot({path:path.join(directory,'detail.png')});const close=page.getByRole('button',{name:/关闭/}).first();if(await close.count()){await close.click();checks.detailsClose=await page.locator('dialog:visible,[role="dialog"]:visible,.modal:visible').count()===0;}else{await page.keyboard.press('Escape');checks.detailsClose=await page.locator('dialog:visible,[role="dialog"]:visible,.modal:visible').count()===0;}}else checks.detailsOpen=false;
   if(kind==='modify'){
    const colors=await page.evaluate(()=>({background:getComputedStyle(document.body).backgroundColor,buttons:[...document.querySelectorAll('button')].map(n=>getComputedStyle(n).backgroundColor)}));
    const rgb=s=>(s.match(/[\d.]+/g)||[]).slice(0,3).map(Number);
    const bg=rgb(colors.background);checks.darkBackground=bg.length===3&&Math.max(...bg)<100;
    checks.purpleButton=colors.buttons.some(s=>{const [r,g,b]=rgb(s);return b>g*1.15&&r>g*1.15&&r>45&&b>60;});
   }
  }
  if(kind==='repair'){
   const button=page.locator('#b');checks.counterExists=await button.count()===1;
   if(checks.counterExists){const before=Number(await button.innerText());await button.click();checks.counterIncrements=Number(await button.innerText())===before+1;}
  }
  await page.screenshot({path:path.join(directory,'desktop.png'),fullPage:true});
  await page.setViewportSize({width:390,height:844});
  checks.mobileNoOverflow=await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1);
  await page.screenshot({path:path.join(directory,'mobile.png'),fullPage:true});
  checks.noScriptErrors=errors.length===0;
  return {passed:Object.values(checks).every(Boolean),checks,errors,screenshots:[path.join(directory,'desktop.png'),path.join(directory,'mobile.png')]};
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
};
