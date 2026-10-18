import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {session} from '../audit-agent-20261018';
import {buildCandidate} from './build-candidate';
import {planTask,presentation} from './policy.mjs';
const root=process.cwd(),out=path.join(root,'local-artifacts/agent-sandbox-20261018');
fs.mkdirSync(out,{recursive:true});
async function main(){
 fs.writeFileSync(path.join(out,'live-image-started.json'),JSON.stringify({startedAt:new Date().toISOString(),limits:{text:8,image:1}}),{flag:'wx'});
 const Harness=await buildCandidate(root);let textCalls=0,imageCalls=0;
 function remote(jobType:string,request:any){
   const raw=execFileSync('ssh',['-o','BatchMode=yes','surecat@8.212.153.167','docker exec -i artedu-api-1 node /tmp/agent-sandbox-model-bridge.cjs'],{input:JSON.stringify({jobType,request}),encoding:'utf8',maxBuffer:32*1024*1024,timeout:jobType==='image'?720000:190000,windowsHide:true});
   return JSON.parse(raw);
 }
 const adapter:any={id:'server-test-deepseek',capabilities:['chat'],async execute(request:any){
   if(textCalls>=8)throw Error('Text API budget exhausted');textCalls++;
   console.log(`TEXT_REQUEST ${textCalls}`);
   const response=remote('chat',{...request,signal:undefined,parameters:{...request.parameters,maxTokens:2400,providerOptions:{...request.parameters?.providerOptions,thinking:{type:'disabled'}}}});
   console.log(`TEXT_RESULT ${response.adapterId} ${response.result.finishReason||'unknown'} tools=${response.result.toolCalls?.map((t:any)=>t.function.name).join(',')||'none'}`);
   return response.result;
 }};
 adapter.executeStream=async(request:any,sink:any)=>{const result=await adapter.execute(request);if(result.content)sink({content:result.content});return result;};
 const imageService=async(input:any)=>{
   if(input.jobType!=='image')throw Error('This live case permits only image generation');
   if(imageCalls>=1)throw Error('Image API budget exhausted; not submitting a duplicate');imageCalls++;
   console.log('IMAGE_REQUEST 1');
   fs.writeFileSync(path.join(out,'live-image-counter.json'),JSON.stringify({textCalls,imageCalls}));
   const response=remote('image',{jobId:'sandbox-image-20261018',messages:[{role:'user',content:input.prompt}],parameters:{providerOptions:input.parameters}});
   if(!response.image)throw Error('No image returned');
   const extension=response.image.mimeType==='image/jpeg'?'jpg':response.image.mimeType==='image/webp'?'webp':'png';
   const fileName='real-generated-image.'+extension,bytes=Buffer.from(response.image.base64,'base64');
   fs.writeFileSync(path.join(out,fileName),bytes);
   fs.writeFileSync(path.join(out,'live-image-artifact.json'),JSON.stringify({adapterId:response.adapterId,fileName,mimeType:response.image.mimeType,sizeBytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')},null,2));
   console.log(`IMAGE_RESULT ${response.adapterId} ${bytes.length} bytes`);
   return {job:{id:'sandbox-image-20261018',status:'succeeded'},artifact:{fileName,mimeType:response.image.mimeType,fileSize:bytes.length,downloadUrl:'/api/agent-sandbox/artifacts/'+fileName}};
 };
 const cases=[
  {id:'explicit-image',prompt:'请调用生图工具生成一张1024x1024的海报主视觉：深蓝背景，一只由金色几何线条构成的飞鸟，简洁现代，无文字。只需要一张真实图片，不要网页、SVG文件或制作说明。',limit:5},
  {id:'no-image',prompt:'不要生成任何图片，也不要调用生图工具。只讨论刚才飞鸟海报的构图和配色，给出三个改进建议。',limit:3},
 ];
 const results:any[]=[];
 for(const c of cases){
   console.log('CASE '+c.id);const contract=planTask({prompt:c.prompt});
   // The explicit negative request is an answer contract even if it mentions image terms.
   if(c.id==='no-image'){contract.action='answer';contract.deliverables=[];}
   const started=Date.now();
   const r=await session([],{harnessClass:Harness,adapter,prompt:c.prompt,scenario:'chat',parameters:{sandboxContract:contract},runGeneration:imageService,callBudget:c.limit,maxTokens:2400});
   const item={id:c.id,prompt:c.prompt,contract,status:r.result.status,delivery:r.result.delivery,view:r.result.delivery?presentation(r.result.delivery,r.events):null,final:r.result.messages?.filter((m:any)=>m.role==='agent').at(-1)?.content,events:r.events,tools:r.toolCalls.map(t=>({name:t.name,output:t.output})),generationInputs:r.generationInputs,modelCalls:r.modelCalls,latencyMs:Date.now()-started};
   results.push(item);
   fs.writeFileSync(path.join(out,'live-image-results.json'),JSON.stringify({limits:{text:8,image:1},textCalls,imageCalls,results},null,2));
   console.log(JSON.stringify({case:c.id,status:item.status,tools:item.tools.map((t:any)=>t.name),modelCalls:item.modelCalls}));
 }
 const positive=results[0],negative=results[1];
 const checks={positiveCallsImage:positive.generationInputs.some((g:any)=>g.jobType==='image'),positiveHasImage:positive.delivery?.artifacts?.some((a:any)=>a.kind==='image')||false,negativeDoesNotGenerate:negative.generationInputs.length===0,textBudgetRespected:textCalls<=8,imageBudgetRespected:imageCalls<=1};
 fs.writeFileSync(path.join(out,'live-image-checks.json'),JSON.stringify(checks,null,2));
 console.log(JSON.stringify(checks));
 assert.ok(Object.values(checks).every(Boolean),'Live image acceptance has failures; inspect recorded evidence');
}
main().catch(e=>{console.error(e.message);process.exitCode=1});
