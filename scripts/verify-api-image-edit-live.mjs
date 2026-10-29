import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
assert.ok(process.argv.includes('--live'),'Use --live for real image editing and optional second image provider');
const require=createRequire(path.resolve('apps/api/package.json')),{PNG}=require('pngjs');
const out=path.resolve('outputs/api-validation-20261026/image-edit');await mkdir(out,{recursive:true});
const origin='http://127.0.0.1:4000',report={startedAt:new Date().toISOString(),checks:[],generationJobs:[],errors:[],status:'running'};let cookie='';
async function request(route,{body,form,expected}={}){const r=await fetch(origin+route,{method:body!==undefined||form?'POST':'GET',headers:{origin:'http://localhost:4173',...(cookie?{cookie}:{}),...(body===undefined?{}:{'content-type':'application/json'})},body:form || (body===undefined?undefined:JSON.stringify(body)),signal:AbortSignal.timeout(240000)});if(expected!==undefined)assert.equal(r.status,expected,route);return r;}
async function json(route,options){const r=await request(route,options),data=await r.json();if(!r.ok)throw Error(`${route}: HTTP ${r.status}; ${data.message || 'request failed'}`);return data;}
const check=(name,extra={})=>{report.checks.push({name,status:'passed',...extra});console.log(JSON.stringify({name,status:'passed',...extra}));};
async function upload(bytes,name){const form=new FormData();form.append('file',new File([bytes],name,{type:'image/png'}));return json('/api/creation-files',{form});}
async function artifact(data,name){const r=await request(data.downloadUrl,{expected:200}),bytes=Buffer.from(await r.arrayBuffer());assert.equal(bytes.length,data.fileSize);assert.ok(bytes.length>1000);assert.match(r.headers.get('content-type'),/^image\//);const target=path.join(out,name);await writeFile(target,bytes);return {bytes,path:target,sha256:createHash('sha256').update(bytes).digest('hex')};}
try{
 const login=await request('/api/auth/login',{body:{username:process.env.ARTEDU_TEST_ADMIN_USERNAME || 'admin.demo',password:process.env.ARTEDU_TEST_ADMIN_PASSWORD || '123456'},expected:201});await login.json();cookie=login.headers.getSetCookie().map(h=>h.split(';')[0]).join('; ');
 const image=new PNG({width:512,height:512}),mask=new PNG({width:512,height:512});
 for(let y=0;y<512;y++)for(let x=0;x<512;x++){const i=(y*512+x)*4,selected=x>=150&&x<362&&y>=150&&y<362;image.data[i]=selected?215:245;image.data[i+1]=selected?45:240;image.data[i+2]=selected?45:230;image.data[i+3]=255;mask.data[i]=mask.data[i+1]=mask.data[i+2]=0;mask.data[i+3]=selected?0:255;}
 const original=PNG.sync.write(image),maskBytes=PNG.sync.write(mask);await writeFile(path.join(out,'original.png'),original);await writeFile(path.join(out,'mask.png'),maskBytes);
 const imageFile=await upload(original,'api-original.png'),maskFile=await upload(maskBytes,'api-mask.png');
 const wrong=new PNG({width:256,height:256});wrong.data.fill(255);const wrongMask=await upload(PNG.sync.write(wrong),'api-wrong-size-mask.png');
 await request('/api/generation-jobs/run',{body:{jobType:'image',prompt:'修改中央颜色',parameters:{referenceFileId:imageFile.id,maskFileId:wrongMask.id}},expected:400});check('mismatched-mask-rejected-before-provider-call');
 const workflow=await json('/api/workflows',{body:{name:`API局部重绘验收-${Date.now()}`,description:'真实 API 原图与透明遮罩验收，草稿不发布',category:'API验收',entryType:'workbench'}});report.workflowId=workflow.id;
 const types=[['image','load_image',''],['prompt','prompt','把图片中央的红色正方形改为纯蓝色正方形，保持原有位置、大小和米白色背景。只修改遮罩指定区域。'],['edit','ksampler',''],['preview','preview',''],['save','save_image','']];
 const nodes=types.map(([id,type,value],i)=>({id,type,position:{x:i*380,y:100},data:{label:id,value}})),edges=nodes.slice(1).map((n,i)=>({id:`e${i}`,source:nodes[i].id,target:n.id,sourceHandle:'output',targetHandle:'input'}));
 const version=await json(`/api/workflows/${workflow.id}/versions`,{body:{definition:{schemaVersion:2,nodes,edges},publish:false}});
 let run=await json(`/api/workflows/${workflow.id}/runs`,{body:{versionId:version.id,context:{}}});report.runId=run.id;
 while(run.status==='in_progress'){const node=run.steps[run.currentStep];console.log(JSON.stringify({stage:'execute-image-edit',node:node.id}));run=await json(`/api/workflow-runs/${run.id}/execute`,{body:node.id==='image'?{referenceFileId:imageFile.id,maskFileId:maskFile.id}:{}});}
 assert.equal(run.status,'completed');assert.ok(run.context.artifact);const jobId=run.context.nodeResults.edit.jobId;report.generationJobs.push(jobId);
 const result=await artifact(run.context.artifact,'edited.png');report.artifact={...run.context.artifact,localPath:result.path,sha256:result.sha256};check('real-image-mask-workflow-completes-and-downloads',{runId:run.id,jobId,bytes:result.bytes.length});
 const decoded=PNG.sync.read(result.bytes);let blue=0,center=0,outsideError=0,outside=0;
 for(let y=0;y<512;y+=4)for(let x=0;x<512;x+=4){const pixel=(Math.min(decoded.height-1,Math.floor(y*decoded.height/512))*decoded.width+Math.min(decoded.width-1,Math.floor(x*decoded.width/512)))*4;
  if(x>=190&&x<322&&y>=190&&y<322){center++;if(decoded.data[pixel+2]>decoded.data[pixel]+40)blue++;}
  if(x<130||x>=382||y<130||y>=382){outsideError+=Math.abs(decoded.data[pixel]-245)+Math.abs(decoded.data[pixel+1]-240)+Math.abs(decoded.data[pixel+2]-230);outside+=3;}
 }
 report.visual={width:decoded.width,height:decoded.height,blueCenterRatio:blue/center,outsideMeanAbsoluteError:outsideError/outside,centerChangedToBlue:blue/center>.5};
 if(decoded.width===512&&decoded.height===512){
  let pixels=0,changedPixels=0,totalError=0;
  for(let i=0;i<image.data.length;i+=4)if(mask.data[i+3]>=128){pixels++;let changed=false;for(let c=0;c<4;c++){totalError+=Math.abs(image.data[i+c]-decoded.data[i+c]);if(image.data[i+c]!==decoded.data[i+c])changed=true;}if(changed)changedPixels++;}
  report.visual.fullOutsideCheck={pixels,changedPixels,meanAbsoluteChannelError:totalError/(pixels*4),sameDimensions:true};
 }
 check('edit-output-decodes-as-valid-image',report.visual);
 let replay=await json(`/api/workflow-runs/${run.id}/nodes/save/rerun`,{body:{}});while(replay.status==='in_progress')replay=await json(`/api/workflow-runs/${replay.id}/execute`,{body:{}});assert.equal(replay.context.nodeResults.edit.jobId,jobId);check('edit-output-rerun-reuses-provider-task');
 if(process.argv.includes('--second-provider')){
  try{
   const generated=await json('/api/generation-jobs/run',{body:{jobType:'image',modelConfigId:'model-modelscope-qwen-image',prompt:'A single simple blue circle centered on a plain cream background, flat graphic, no text.',parameters:{size:'1024x1024',imageCount:1,source:'api-capability-qa-20261026'}}});
   assert.equal(generated.job.status,'succeeded');report.generationJobs.push(generated.job.id);const secondary=await artifact(generated.artifact,'modelscope.png');report.secondProvider={status:'passed',jobId:generated.job.id,artifact:{...generated.artifact,localPath:secondary.path}};check('second-image-provider-modelscope',{jobId:generated.job.id,bytes:secondary.bytes.length});
  }catch(error){report.secondProvider={status:'failed',message:error.message};report.errors.push(error.message);console.error(JSON.stringify(report.secondProvider));}
 }
 report.status=report.errors.length?'partial':'passed';
}catch(error){report.status='failed';report.errors.push(error.message);console.error(JSON.stringify({status:'failed',message:error.message}));process.exitCode=1;}
finally{report.finishedAt=new Date().toISOString();await writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));if(cookie)await request('/api/auth/logout',{body:{}}).catch(()=>{});console.log(JSON.stringify({status:report.status,passed:report.checks.length,report:path.join(out,'report.json')}));}
