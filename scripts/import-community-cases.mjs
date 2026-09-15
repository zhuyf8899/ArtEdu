/** Import reviewed local case manifests through the same authenticated API as the UI.
 * Dry-run by default. --apply saves drafts; --submit additionally submits for moderation.
 * No approval/publish action, model calls, database bypass, or credential logging.
 */
import {readFile,writeFile,realpath} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const types={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.mp4':'video/mp4','.webm':'video/webm','.pdf':'application/pdf','.docx':'application/vnd.openxmlformats-officedocument.wordprocessingml.document','.pptx':'application/vnd.openxmlformats-officedocument.presentationml.presentation'};
export function importOrigin(value){
 const url=new URL(value);
 if(url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw new Error('Use an origin without credentials, path or query');
 if(url.protocol!=='https:'&&!(url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname)))throw new Error('Remote imports require HTTPS');
 return url.origin;
}
export async function prepareManifest(manifestPath){
 const root=await realpath(path.dirname(manifestPath));
 const manifest=JSON.parse(await readFile(manifestPath,'utf8'));
 if(manifest.version!==1||!Array.isArray(manifest.cases)||!manifest.cases.length||manifest.cases.length>100)throw new Error('Invalid case manifest');
 const keys=new Set(),titles=new Set();
 for(const item of manifest.cases){
  if(!/^[a-z0-9_-]{1,80}$/.test(item.key)||keys.has(item.key)||!item.payload?.title||titles.has(item.payload.title))throw new Error('Duplicate or invalid case identity');
  keys.add(item.key);titles.add(item.payload.title);
  if(!Array.isArray(item.assets)||!item.assets.length||item.assets.length>10)throw new Error(`${item.key}: expected 1–10 assets`);
  const filenames=new Set();
  for(const asset of item.assets){
   if(typeof asset.file!=='string'||path.isAbsolute(asset.file)||filenames.has(asset.file))throw new Error('Invalid or duplicate asset path');
   filenames.add(asset.file);
   const full=await realpath(path.resolve(root,asset.file)),relative=path.relative(root,full);
   if(relative==='..'||relative.startsWith(`..${path.sep}`)||path.isAbsolute(relative))throw new Error('Asset escapes manifest directory');
   const bytes=await readFile(full),mime=types[path.extname(full).toLowerCase()];
   if(!mime||!bytes.length||bytes.length>10*1024*1024)throw new Error(`${item.key}: unsupported or oversized asset`);
   const digest=createHash('sha256').update(bytes).digest('hex');
   if(asset.sha256!==digest)throw new Error(`${item.key}: asset checksum mismatch`);
   Object.assign(asset,{full,mime,digest,size:bytes.length});
  }
  const images=new Set(item.assets.filter(a=>a.mime.startsWith('image/')).map(a=>a.file));
  if(item.coverFile&&!images.has(item.coverFile))throw new Error('Cover must be an image in this case');
  for(const step of item.payload.story?.steps??[]){
   if((step.imageFiles??[]).some(f=>!images.has(f)))throw new Error('Step image must belong to the same case');
  }
 }
 return manifest;
}
async function main(){
 const args=process.argv.slice(2),manifestPath=args.find(a=>!a.startsWith('--'));
 if(!manifestPath)throw new Error('Usage: node scripts/import-community-cases.mjs <manifest.json> [--apply] [--submit]');
 const origin=importOrigin(process.env.CASE_IMPORT_ORIGIN||'http://localhost:4273');
 const manifest=await prepareManifest(path.resolve(manifestPath));
 const require=createRequire(import.meta.url);
 const {workInputSchema}=require('../apps/api/dist/modules/studio/studio.contracts.js');
 const payloadFor=(item,assetMap={})=>workInputSchema.parse({...item.payload,story:{...item.payload.story,coverAssetId:assetMap[item.coverFile]??'',steps:item.payload.story.steps.map(({imageFiles,...step})=>({...step,assetIds:(imageFiles??[]).map(f=>assetMap[f]).filter(Boolean)}))}});
 for(const item of manifest.cases){payloadFor(item);if(args.includes('--submit')&&(item.payload.story.origin!=='collected'||item.payload.story.authorization!=='confirmed'||!item.payload.story.creators.length||!item.payload.story.authorizationNote))throw new Error('Submission requires confirmed attribution and exhibition permission');}
 console.log(JSON.stringify({origin,cases:manifest.cases.length,assets:manifest.cases.reduce((n,c)=>n+c.assets.length,0),mode:args.includes('--apply')?(args.includes('--submit')?'submit-for-review':'draft'):'dry-run'}));
 if(!args.includes('--apply'))return;
 if(!process.env.CASE_IMPORT_USERNAME||!process.env.CASE_IMPORT_PASSWORD)throw new Error('Set CASE_IMPORT_USERNAME and CASE_IMPORT_PASSWORD (not command-line flags)');
 let cookie='';
 let lastWrite=0;
 async function request(route,method='GET',body,rateLimitRetries=0){
  if(!route.startsWith('/api/')||route.startsWith('//'))throw new Error('Unexpected API route');
  // Pace uploads before transmitting multipart bodies; an early 429 can close a proxy stream.
  if(!['GET','HEAD','OPTIONS'].includes(method)){
   const delay=2100-(Date.now()-lastWrite);if(delay>0)await new Promise(resolve=>setTimeout(resolve,delay));
   lastWrite=Date.now();
  }
  const form=body instanceof FormData;
  const response=await fetch(origin+route,{method,headers:{origin,...(cookie?{cookie}:{}),...(body&&!form?{'content-type':'application/json'}:{})},body:body?(form?body:JSON.stringify(body)):undefined,redirect:'error',signal:AbortSignal.timeout(60000)});
  if(response.status===429&&rateLimitRetries<3){
   const seconds=Math.max(1,Math.min(60,Number(response.headers.get('retry-after'))||60));
   console.log(`Rate limit: waiting ${seconds}s before retrying rejected request`);
   await response.arrayBuffer();await new Promise(resolve=>setTimeout(resolve,seconds*1000));
   return request(route,method,body,rateLimitRetries+1);
  }
  if(!response.ok)throw new Error(`${method} ${route}: HTTP ${response.status}`);
  return response;
 }
 const login=await request('/api/auth/login','POST',{username:process.env.CASE_IMPORT_USERNAME,password:process.env.CASE_IMPORT_PASSWORD});
 cookie=login.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
 const receiptPath=path.resolve(path.dirname(manifestPath),'import-receipt.json');
 let receipt;
 try{receipt=JSON.parse(await readFile(receiptPath,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;receipt={origin,username:process.env.CASE_IMPORT_USERNAME,cases:{}};}
 if(receipt.origin!==origin||receipt.username!==process.env.CASE_IMPORT_USERNAME)throw new Error('Receipt belongs to a different destination or account');
 async function checkpoint(){await writeFile(receiptPath,JSON.stringify(receipt,null,2),'utf8');}
 try{
  const mine=(await (await request('/api/me/works')).json()).items;
  for(const item of manifest.cases){
   const matches=mine.filter(w=>w.title===item.payload.title);
   if(matches.length>1)throw new Error(`${item.key}: ambiguous existing cases`);
   let id=receipt.cases[item.key]?.id??matches[0]?.id;
   if(!id){const created=await (await request('/api/works','POST',payloadFor(item))).json();id=created.id;receipt.cases[item.key]={id,title:item.payload.title,status:'draft'};await checkpoint();}
   let work=await (await request(`/api/works/${encodeURIComponent(id)}`)).json();
   if(work.title!==item.payload.title)throw new Error('Receipt target title changed; refusing overwrite');
   if(!['draft','rejected','pending'].includes(work.status))throw new Error(`${item.key}: already published or unavailable; inspect manually`);
   const map={};
   // Hash already stored assets, including earlier samples, to avoid duplicate media on retry.
   for(const asset of work.assets){
    if(!asset.url.startsWith(`/api/works/${encodeURIComponent(id)}/assets/`))throw new Error('Unexpected asset URL');
    const hash=createHash('sha256').update(Buffer.from(await (await request(asset.url)).arrayBuffer())).digest('hex');
    for(const expected of item.assets)if(expected.digest===hash)map[expected.file]=asset.id;
   }
   const missing=item.assets.filter(a=>!map[a.file]);
   if(work.assets.length+missing.length>10)throw new Error(`${item.key}: existing files conflict with import, inspect manually`);
   if(work.status==='pending'){
    const expected=payloadFor(item,map);
    if(missing.length||JSON.stringify(work.story)!==JSON.stringify(expected.story))throw new Error(`${item.key}: pending case differs; cannot silently overwrite`);
   }else{
    for(const asset of missing){
     const form=new FormData(),extension=asset.mime==='image/jpeg'?'.jpg':path.extname(asset.file);
     form.append('file',new Blob([await readFile(asset.full)],{type:asset.mime}),`case-${item.key}-${String(item.assets.indexOf(asset)+1).padStart(2,'0')}${extension}`);
     const saved=await (await request(`/api/works/${encodeURIComponent(id)}/assets`,'POST',form)).json();map[asset.file]=saved.id;
    }
    const expected=payloadFor(item,map);
    work=await (await request(`/api/works/${encodeURIComponent(id)}`,'PUT',expected)).json();
    if(JSON.stringify(work.story)!==JSON.stringify(expected.story))throw new Error(`${item.key}: saved story differs`);
    // Verify every stored file before submission; no automatic approval follows.
    for(const asset of work.assets){const expectedAsset=item.assets.find(a=>map[a.file]===asset.id);if(!expectedAsset)continue;const bytes=Buffer.from(await (await request(asset.url)).arrayBuffer());if(createHash('sha256').update(bytes).digest('hex')!==expectedAsset.digest)throw new Error('Stored asset checksum mismatch');}
    if(args.includes('--submit'))work=await (await request(`/api/works/${encodeURIComponent(id)}/submit`,'POST',{})).json();
   }
   receipt.cases[item.key]={id,title:work.title,status:work.status,assets:work.assets.length,steps:work.story.steps.length,verifiedAt:new Date().toISOString()};await checkpoint();
   console.log(JSON.stringify(receipt.cases[item.key]));
  }
 }finally{await request('/api/auth/logout','POST',{}).catch(()=>{});}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{console.error(error.message);process.exitCode=1;});
