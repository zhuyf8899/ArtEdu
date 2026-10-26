import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {importComfy,exportComfyUI,validateGraphStructure} from '../admin-console/src/comfyGraph.js';
const root=path.resolve('data/comfy-workflow-library');
const repo='Comfy-Org/workflow_templates',commit='67984637eefcd4825dcf5c134e39034785be1682';
export const cases=[
 ['01-text-to-image','基础文生图','archived/default.json','基础采样：检查点、正负条件、空潜空间、采样、VAE 解码和保存。',''],
 ['02-image-to-image','图生图','archived/image2image.json','载入原图经 VAE 编码后进入采样器，保留原始 denoise 与尺寸处理。','img2img'],
 ['03-inpainting','局部重绘','archived/inpaint_example.json','保留原图透明遮罩及重绘编码链，不改成普通文字生图。','inpaint'],
 ['04-outpainting','向外扩图','archived/inpaint_model_outpainting.json','保留扩图 padding、遮罩与重绘模型链。','inpaint'],
 ['05-lora','单 LoRA（保留旁路层）','archived/lora.json','启用 blindbox 权重 0.75 / 1，原图第二层 MoXin 权重 0.5 / 1 处于旁路模式 4；完整保留旁路状态。','lora'],
 ['06-multiple-loras','多 LoRA 串联','archived/lora_multiple.json','保留串联顺序和每层 MODEL、CLIP 权重，不合并为一个风格提示词。','lora'],
 ['07-hires-latent','潜空间二次采样放大','archived/hiresfix_latent_workflow.json','低分辨率采样、潜空间放大、第二次采样，保留两阶段参数。','2_pass_txt2img'],
 ['08-hires-esrgan','ESRGAN 二次采样放大','archived/hiresfix_esrgan_workflow.json','像素空间超分后重新编码到潜空间，再做二次采样。','2_pass_txt2img'],
 ['09-controlnet','ControlNet 控制','archived/controlnet_example.json','保留控制图、控制模型及条件强度，不虚构预处理器。','controlnet'],
 ['10-mixed-controlnets','多 ControlNet 混合','archived/mixing_controlnets.json','保留多个控制图和顺序应用的条件链。','controlnet'],
 ['11-esrgan','模型超分','archived/esrgan_example.json','保留 UpscaleModelLoader 和 ImageUpscaleWithModel 的真实模型引用。','upscale_models'],
 ['12-sdxl-refiner','SDXL Base 与 Refiner','templates/sdxl_refiner_prompt_example.json','保留 Base、Refiner 独立提示词与高级采样器阶段边界。','sdxl'],
];
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
async function fetchPinned(file){
 for(let attempt=0;attempt<4;attempt++){
  try{
   const url=attempt<2?`https://raw.githubusercontent.com/${repo}/${commit}/${file}`:`https://api.github.com/repos/${repo}/contents/${file}?ref=${commit}`;
   const r=await fetch(url,{headers:{'User-Agent':'ArtEdu-Workflow-Replication',Accept:'application/vnd.github.raw+json'},signal:AbortSignal.timeout(25000)});
   if(!r.ok)throw Error(`HTTP ${r.status}`);return Buffer.from(await r.arrayBuffer());
  }catch(e){if(attempt===3)throw Error(`${file}: ${e.message}`);}
 }
}
await Promise.all(['originals','replicas','platform','analysis'].map(dir=>mkdir(path.join(root,dir),{recursive:true})));
if(process.argv.includes('--fetch')){
 const queue=[...cases.map(c=>c[2]),'LICENSE','archived/index.json'];
 const failures=[];
 await Promise.all(Array.from({length:4},async()=>{while(queue.length){const file=queue.shift();try{const bytes=await fetchPinned(file);const target=file.endsWith('.json')&&file!=='archived/index.json'?path.join(root,'originals',path.basename(file)):path.join(root,file.replaceAll('/','-'));await writeFile(target,bytes);console.log(`Fetched ${file} (${bytes.length} bytes)`);}catch(e){failures.push(e.message);}}}));
 if(failures.length)throw Error(failures.join('\n'));
}
let index=[];try{index=JSON.parse(await readFile(path.join(root,'archived-index.json'),'utf8'));}catch{}
const entries=Array.isArray(index)?index.flatMap(group=>group.templates || []):[];
let previousManifest={};try{previousManifest=JSON.parse(await readFile(path.join(root,'manifest.json'),'utf8'));}catch{}
const manifest={inputAssets:previousManifest.inputAssets || [],repository:`https://github.com/${repo}`,commit,license:'MIT',createdAt:new Date().toISOString(),replication:'original node IDs, types, sockets, widgets, positions, dimensions, groups and opaque metadata',execution:'not executed; GPU bridge disabled',cases:[]};
for(const [id,title,sourcePath,review,topic] of cases){
 const original=await readFile(path.join(root,'originals',path.basename(sourcePath)));const raw=JSON.parse(original);
 const definition=importComfy(raw);validateGraphStructure(definition);
 const exported=exportComfyUI(definition,{},raw.version || .4);
 const equal=JSON.stringify(exported)===JSON.stringify(raw);
 // JSON object key order is immaterial. Deep equality checks every saved field.
 let exact=true,difference='';try{assert.deepEqual(exported,raw);}catch(e){exact=false;difference=e.message.slice(0,3000);}
 const template=entries.find(e=>e.name===path.basename(sourcePath,'.json'));
 const dependencies=raw.nodes.filter(n=>/Loader|LoadImage|Embedding/.test(n.type)).map(n=>({id:n.id,type:n.type,mode:n.mode || 0,widgets:n.widgets_values,models:n.properties?.models || []}));
 const record={id,title,sourcePath,sourceUrl:`https://github.com/${repo}/blob/${commit}/${sourcePath}`,rawUrl:`https://raw.githubusercontent.com/${repo}/${commit}/${sourcePath}`,tutorialUrl:template?.tutorialUrl || `https://comfyanonymous.github.io/ComfyUI_examples/${topic?topic+'/':''}`,sourceSha256:sha(original),nodes:raw.nodes.length,links:raw.links.length,groups:raw.groups?.length || 0,nodeTypes:[...new Set(raw.nodes.map(n=>n.type))],review,dependencies,exactRoundTrip:exact,difference};
 await writeFile(path.join(root,'replicas',id+'.json'),original);
 await writeFile(path.join(root,'platform',id+'.json'),JSON.stringify({format:'artedu-comfy-workflow',version:2,workflow:{name:`ComfyUI 复刻 · ${title}`,description:`1:1 原始工作流复刻。${review}\n来源：${record.sourceUrl}`,category:'ComfyUI 复刻',entryType:'workbench'},definition},null,2));
 await writeFile(path.join(root,'analysis',id+'.json'),JSON.stringify({...record,nodes:raw.nodes.map(n=>({id:n.id,type:n.type,title:n.title,position:n.pos,size:n.size,inputs:n.inputs,outputs:n.outputs,widgets:n.widgets_values,mode:n.mode,properties:n.properties})),links:raw.links},null,2));
 manifest.cases.push(record);console.log(JSON.stringify({id,nodes:record.nodes,links:record.links,exactRoundTrip:exact}));
}
await writeFile(path.join(root,'manifest.json'),JSON.stringify(manifest,null,2));
if(manifest.cases.some(c=>!c.exactRoundTrip)){console.log('Round-trip differences recorded in manifest; fix exchange before claiming exact platform replication.');process.exitCode=1;}
if(process.argv.includes('--assets')){
 await mkdir(path.join(root,'input'),{recursive:true});
 const names=[...new Set(manifest.cases.flatMap(c=>c.dependencies.filter(d=>d.type==='LoadImage').map(d=>d.widgets[0])))];
 manifest.inputAssets=[];
 await Promise.all(names.map(async name=>{
  const bytes=await fetchPinned('input/'+name);await writeFile(path.join(root,'input',name),bytes);
  manifest.inputAssets.push({name,bytes:bytes.length,sha256:sha(bytes),url:`https://raw.githubusercontent.com/${repo}/${commit}/input/${name}`});console.log(`Input ${name}: ${bytes.length} bytes`);
 }));
 await writeFile(path.join(root,'manifest.json'),JSON.stringify(manifest,null,2));
}
if(process.argv.includes('--install')){
 assert.ok(manifest.cases.every(c=>c.exactRoundTrip),'Do not install mismatched replicas');
 const origin=process.env.ARTEDU_TEST_ORIGIN || 'http://127.0.0.1:4000';
 assert.ok(['localhost','127.0.0.1'].includes(new URL(origin).hostname));
 let cookie='';
 async function api(route,body,method){
  const response=await fetch(origin+route,{method:method || (body===undefined?'GET':'POST'),headers:{origin:'http://localhost:4173',...(cookie?{cookie}:{}),...(body===undefined?{}:{'content-type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(30000)});
  const payload=await response.json();if(!response.ok)throw Error(`${route}: ${response.status}; ${payload.message || 'failed'}`);return {payload,response};
 }
 const login=await api('/api/auth/login',{username:process.env.ARTEDU_TEST_ADMIN_USERNAME || 'admin.demo',password:process.env.ARTEDU_TEST_ADMIN_PASSWORD || '123456'});
 cookie=login.response.headers.getSetCookie().map(h=>h.split(';')[0]).join('; ');
 let installed={};try{installed=JSON.parse(await readFile(path.join(root,'installed.json'),'utf8'));}catch{}
 try{
  for(const record of manifest.cases){
   const backup=JSON.parse(await readFile(path.join(root,'platform',record.id+'.json'),'utf8'));
   let workflowId=installed[record.id]?.workflowId;
   if(!workflowId){workflowId=(await api('/api/workflows',backup.workflow)).payload.id;installed[record.id]={workflowId};await writeFile(path.join(root,'installed.json'),JSON.stringify(installed,null,2));}
   let detail=(await api('/api/admin/workflows/'+workflowId)).payload;
   if(detail.name!==backup.workflow.name)await api('/api/admin/workflows/'+workflowId,backup.workflow,'PUT');
   let version=detail.versions?.find(v=>v.id===installed[record.id]?.versionId);
   if(!version || installed[record.id]?.sha256!==record.sourceSha256){version=(await api(`/api/workflows/${workflowId}/versions`,{definition:backup.definition,publish:false})).payload;}
   detail=(await api('/api/admin/workflows/'+workflowId)).payload;
   const saved=detail.versions.find(v=>v.id===version.id).definition;
   const exported=exportComfyUI(saved,{},JSON.parse(await readFile(path.join(root,'originals',path.basename(record.sourcePath)),'utf8')).version);
   assert.deepEqual(exported,JSON.parse(await readFile(path.join(root,'replicas',record.id+'.json'),'utf8')));
   installed[record.id]={workflowId,versionId:version.id,sha256:record.sourceSha256,serverRoundTripExact:true,url:`http://localhost:4173/admin/workflows?edit=${workflowId}`};
   await writeFile(path.join(root,'installed.json'),JSON.stringify(installed,null,2));console.log(JSON.stringify({installed:record.id,workflowId,serverRoundTripExact:true}));
  }
 }finally{await api('/api/auth/logout',{}).catch(()=>{});}
}
