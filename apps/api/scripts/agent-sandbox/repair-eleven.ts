/** All eleven agreed cases. Real server model APIs; only isolated file/workflow fixtures. */
import fs from 'node:fs';import path from 'node:path';import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';
import {session} from '../audit-agent-20261018';import {buildCandidate} from './build-candidate';import {branchContext,presentation} from './policy.mjs';
import {checkBrowser} from './browser-check.cjs';
import {documentPrompt} from '../../src/modules/generation/document-content';
const round=Number(process.argv.find(s=>s.startsWith('--round='))?.split('=')[1]);
if(!Number.isInteger(round)||round<1||round>5)throw Error('必须指定 --round=1..5；最多5轮完整测试');
const root=process.cwd(),out=path.join(root,`local-artifacts/agent-sandbox-20261018/repair/round-${round}`);fs.mkdirSync(out,{recursive:true});
const web={action:'create',deliverables:[{kind:'webpage',format:'html'}]},answer={action:'answer',deliverables:[]};
const titles=['否定生图，只解释海报','解释PDF/Word/PPT用途','六件作品交互画廊','深色与紫色多轮修改','Word教案与课程网页','修复CSS与脚本错误','40件作品与预算边界','执行中暂停','重试排除弃用分支','工作流介绍与确认启动','调用生图工具生成真实图片'];
async function main(){
 if(round>1){const previous=path.resolve(out,'..',`round-${round-1}`);const prior=JSON.parse(fs.readFileSync(path.join(previous,'results.json'),'utf8'));if(prior.results.length!==11)throw Error('上一轮尚未完成全部11例，禁止启动新一轮');const reviewedPath=path.join(previous,'reviewed-results.json');const reviewed=fs.existsSync(reviewedPath)?JSON.parse(fs.readFileSync(reviewedPath,'utf8')):null;if(prior.results.every(r=>r.verdict==='passed')&&(!reviewed||!reviewed.failed?.length))throw Error('上一轮已全部通过，无需继续消耗API');}
 fs.writeFileSync(path.join(out,'started.json'),JSON.stringify({at:new Date().toISOString(),limits:{textCalls:60,imageCalls:1}}),{flag:'wx'});
 const Harness=await buildCandidate(root),results:any[]=[];let textCalls=0,imageCalls=0,activeCase=0,abortedUpstream=false;
 fs.writeFileSync(path.join(out,'source-snapshot.json'),JSON.stringify(Object.fromEntries(['runtime.ts','tools.ts','policy.mjs','repair-eleven.ts','server-model-bridge.cjs','browser-check.cjs'].map(name=>[name,createHash('sha256').update(fs.readFileSync(path.join(root,'apps/api/scripts/agent-sandbox',name))).digest('hex')])),null,2));
 fs.mkdirSync(path.join(out,'source'),{recursive:true});for(const name of ['runtime.ts','tools.ts','policy.mjs','repair-eleven.ts','server-model-bridge.cjs','browser-check.cjs','build-candidate.ts'])fs.copyFileSync(path.join(root,'apps/api/scripts/agent-sandbox',name),path.join(out,'source',name));
 function checkpoint(){fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({textCalls,imageCalls,limits:{textCalls:60,imageCalls:1},results},null,2));}
 function remote(jobType:string,request:any,extra:any={}){
  if(jobType!=='image'){if(textCalls>=60)throw Error('GLOBAL_TEXT_BUDGET');textCalls++;}
  console.log(`API case=${activeCase} type=${jobType} text=${textCalls} image=${imageCalls}`);checkpoint();
  const body=execFileSync('ssh',['-o','BatchMode=yes','surecat@8.212.153.167','docker exec -i artedu-api-1 node /tmp/agent-sandbox-model-bridge.cjs'],{input:JSON.stringify({jobType,request,...extra}),encoding:'utf8',maxBuffer:32*1024*1024,timeout:jobType==='image'?720000:190000,windowsHide:true});
  return JSON.parse(body);
 }
 const assets:any[]=[];
 async function generate(input:any){
  if(input.jobType==='image'){
   if(activeCase!==11)throw Error('该测试未授权生图，不消耗图片额度');
   if(imageCalls>=1)throw Error('IMAGE_BUDGET：不重复提交');imageCalls++;
   const data=remote('image',{jobId:`sandbox-repair-r${round}-image-20261018`,messages:[{role:'user',content:input.prompt}],parameters:{providerOptions:{...input.parameters,negativePrompt:'文字，汉字，字幕，标语，watermark, typography, text, letters'}}},{providerId:'model-siliconflow-kolors',downstreamAsset:true});
   if(!data.image)throw Error('No real image');
   const extension=data.image.mimeType==='image/jpeg'?'jpg':data.image.mimeType==='image/webp'?'webp':'png';
   const result=saveAsset(data.image,'test11-generated.'+extension,data.adapterId);
   console.log('VISUAL_REVIEW_REQUIRED '+JSON.stringify(assets.at(-1)));
   const reviewPath=path.join(out,'image-review.json');
   const deadline=Date.now()+600000;
   while(!fs.existsSync(reviewPath)&&Date.now()<deadline)await new Promise(r=>setTimeout(r,1000));
   if(!fs.existsSync(reviewPath))return {...result,visualReview:{status:'fail',issues:['视觉复核超时']}};
   const review=JSON.parse(fs.readFileSync(reviewPath,'utf8'));
   if(review.sha256!==assets.at(-1).sha256||!['pass','fail'].includes(review.status))throw Error('视觉复核未绑定实际图片哈希');
   return {...result,visualReview:review};
  }
  if(input.jobType==='document'&&activeCase===5){
   const context=(input.context||[]).map((m:any)=>`${m.role}: ${m.content}`).join('\n').slice(-12000);
   const instructions=documentPrompt(input.parameters?.outputFormat||'docx')+'本次用4节：目标与准备、观察10分钟、创作25分钟、展示评价10分钟。每节1段80字内正文与至多3条30字内要点；覆盖三项目标。';
   const data=remote('document',{jobId:'sandbox-eleven-doc-20261018',messages:[{role:'system',content:instructions},{role:'user',content:context+'\n文档任务：'+input.prompt}],parameters:{maxTokens:2400,responseFormat:'json_object',providerOptions:{thinking:{type:'disabled'}}}},{format:input.parameters?.outputFormat||'docx'});
   if(!data.document)throw Error('No exported document');
   return saveAsset(data.document,'test05-course.docx',data.adapterId);
  }
  throw Error('本项测试未启用该生成服务');
 }
 function saveAsset(asset:any,fileName:string,adapterId:string){
  const bytes=Buffer.from(asset.base64,'base64');fs.writeFileSync(path.join(out,fileName),bytes);
  const record={case:activeCase,fileName,mimeType:asset.mimeType,sizeBytes:bytes.length,adapterId,aiGenerated:true,usage:activeCase===11?'private-downstream-input':'test-document',sha256:createHash('sha256').update(bytes).digest('hex')};assets.push(record);fs.writeFileSync(path.join(out,'artifacts.json'),JSON.stringify(assets,null,2));
  return {job:{id:'sandbox-eleven-'+activeCase,status:'succeeded'},artifact:{fileName,mimeType:asset.mimeType,fileSize:bytes.length,downloadUrl:'/api/agent-sandbox/artifacts/'+fileName}};
 }
 async function turn(prompt:string,contract:any,extra:any={}){
  const control=extra.control||new AbortController();
  let pauseDeadline=extra.abortAfterMs?Date.now()+extra.abortAfterMs:0;
  const adapter:any={id:'server-test-deepseek',capabilities:['chat'],async execute(request:any){
   if(pauseDeadline&&Date.now()>=pauseDeadline){control.abort();throw Error('用户暂停，未再发起请求');}
   const data=remote('chat',{...request,signal:undefined,parameters:{...request.parameters,maxTokens:extra.maxTokens||2400,providerOptions:{...request.parameters?.providerOptions,thinking:{type:'disabled'}}}},pauseDeadline?{abortAfterMs:Math.max(1,pauseDeadline-Date.now())}:{});
   if(data.aborted){abortedUpstream=true;control.abort();throw Error(data.error);}
   return data.result;
  }};
  adapter.executeStream=async(request:any,sink:any)=>{const r=await adapter.execute(request);if(r.content)sink({content:r.content});return r;};
  const r=await session([],{harnessClass:Harness,adapter,prompt,scenario:'chat',parameters:{sandboxContract:contract,sandboxRecovery:true,sandboxRounds:extra.callBudget||8},runGeneration:generate,callBudget:extra.callBudget||8,maxTokens:extra.maxTokens||2400,signal:control.signal,files:extra.files||{},context:extra.context||[],onProgress:e=>{if(e.kind==='tool')console.log(`TOOL case=${activeCase} name=${e.name} status=${e.status}`);}});
  return {status:r.result.status,delivery:r.result.delivery,view:r.result.delivery?presentation(r.result.delivery,r.events):null,final:r.result.messages?.filter((m:any)=>m.role==='agent').at(-1)?.content||'',files:r.files,events:r.events,toolCalls:r.toolCalls,generationInputs:r.generationInputs,workflowStarts:r.workflowStarts,requests:r.requests,modelCalls:r.modelCalls};
 }
 async function run(id:number,fn:()=>Promise<any>){activeCase=id;console.log(`CASE ${id}/11 ${titles[id-1]}`);const before=textCalls,started=Date.now();try{const value=await fn();results.push({id,title:titles[id-1],textCalls:textCalls-before,elapsedMs:Date.now()-started,...value});}catch(error){results.push({id,title:titles[id-1],verdict:'failed',error:(error as Error).message,textCalls:textCalls-before,elapsedMs:Date.now()-started});}checkpoint();console.log('CASE_DONE '+JSON.stringify({id,verdict:results.at(-1).verdict,status:results.at(-1).turns?.at(-1)?.status}));}
 const finish=(turns:any[],checks:any,notes:string[]=[])=>({verdict:Object.values(checks).every(Boolean)?'passed':'failed',checks,notes,turns});
 await run(1,async()=>{const r=await turn('不要生成图片，只解释这张海报的构图思路。测试参考说明：深蓝底，中央金色飞鸟，上方留白；没有附实际图片，请区分描述推测与实际观察。',answer);return finish([r],{noGeneration:r.generationInputs.length===0,noFiles:r.files.length===0,answered:r.status==='succeeded'});});
 await run(2,async()=>{const r=await turn('解释 PDF、Word 和 PPT 分别适合什么场景。不要创建文件。',answer);return finish([r],{noGeneration:r.generationInputs.length===0,noFiles:r.files.length===0,formatsExplained:/PDF/i.test(r.final)&&/Word/i.test(r.final)&&/PPT/i.test(r.final),answered:r.status==='succeeded'});});
 let gallery:any=null;
 await run(3,async()=>{gallery=await turn('做一个学生作品画廊，包含6件作品、分类筛选和作品详情。分类按钮明确叫“全部”“绘画”“摄影”，每类3件作品；作品使用article标签，详情用有名称的按钮和dialog弹窗。缩略图用CSS或内联SVG绘制，不调用生图。实际保存网页并检查，不要仅给说明。',web);const browser=await checkBrowser(gallery.files,path.join(out,'case03'),'gallery');fs.writeFileSync(path.join(out,'browser03.json'),JSON.stringify(browser,null,2));return finish([gallery],{delivered:gallery.status==='succeeded',checked:gallery.delivery?.artifacts.some(a=>a.kind==='webpage'&&a.validation==='pass'),browserInteractive:browser.passed});});
 const fallback='<style>body{background:white;color:black}</style><button data-filter="all">全部</button><main><article data-category="a">作品1<button onclick="document.querySelector(\'dialog\').showModal()">详情</button></article></main><dialog>作品详情<button onclick="this.parentNode.close()">关闭</button></dialog>';
 await run(4,async()=>{if(!gallery?.files?.length)return {verdict:'failed',error:'第3项无实际产物，连续修改链路阻塞，未使用备用夹具'};const files=Object.fromEntries(gallery.files);const key=Object.keys(files).find(p=>/\.html$/.test(p))||'index.html';const r=await turn('改成深色，按钮换成紫色，其他功能保留。请先读取现有网页及其引用的CSS再修改并检查。',{action:'modify',deliverables:[{kind:'webpage',format:'html',path:key}]},{files,context:[{role:'assistant',content:'上一轮作品画廊保存在 '+key+'，文件清单：'+Object.keys(files).join(',')+'；包含分类筛选与详情。'}]});const browser=await checkBrowser(r.files,path.join(out,'case04'),'modify');fs.writeFileSync(path.join(out,'browser04.json'),JSON.stringify(browser,null,2));return finish([r],{delivered:r.status==='succeeded',browserInteractiveAndColors:browser.passed,usesActualPreviousFiles:true});});
 await run(5,async()=>{const r=await turn('根据刚才讨论的课程方案，同时生成 Word 教案和课程介绍网页。两份都要真正文件，网页保存到工作区并检查；Word调用文档工具。',{action:'create',deliverables:[{kind:'document',format:'docx'},{kind:'webpage',format:'html'}]},{context:[{role:'user',content:'课程为传统纹样与当代设计，初中生，45分钟：观察10分钟、重组创作25分钟、展示评价10分钟。'},{role:'assistant',content:'已约定三项目标：识别重复规律、完成纹样重组、说明设计意图。'}]});const browser=await checkBrowser(r.files,path.join(out,'case05'),'course');fs.writeFileSync(path.join(out,'browser05.json'),JSON.stringify(browser,null,2));return finish([r],{bothDelivered:r.status==='succeeded',realWord:assets.some(a=>a.case===5&&a.fileName.endsWith('.docx')),webChecked:r.delivery?.artifacts.some(a=>a.kind==='webpage'&&a.validation==='pass'),browserLoads:browser.passed});});
 await run(6,async()=>{const r=await turn('修复这个网页：样式引用不存在，按钮脚本也有语法错误。保留作品展标题和按钮id=b，按钮点击应增加计数，修复后重新检查。',web,{files:{'index.html':'<link rel="stylesheet" href="missing.css"><h1>作品展</h1><button id="b">0</button><script>const = ; b.onclick=()=>b.textContent=Number(b.textContent)+1;</script>'}});const browser=await checkBrowser(r.files,path.join(out,'case06'),'repair');fs.writeFileSync(path.join(out,'browser06.json'),JSON.stringify(browser,null,2));return finish([r],{delivered:r.status==='succeeded',checked:r.delivery?.artifacts.some(a=>a.validation==='pass'),titlePreserved:r.files.some(f=>f[1].includes('作品展')),actualClickWorks:browser.passed});});
 await run(7,async()=>{const r=await turn('制作一个包含40件作品的交互画廊，支持筛选和详情。不要用外部资源。若输出预算不足，要保留真实部分成果并明确哪些尚未完成。',web,{callBudget:3,maxTokens:1000});return finish([r],{budgetRespected:r.modelCalls<=3,noFalseSuccess:r.status!=='succeeded'||r.delivery?.artifacts.some(a=>a.validation==='pass'),missingCannotPass:!r.delivery?.missing.length||r.status!=='succeeded'},['专门施加3次调用、1000输出token压力；控制逻辑通过不等于40件作品全部交付。']);});
 await run(8,async()=>{const r=await turn('制作一个复杂交互画廊，包含40件作品并保存文件。',web,{abortAfterMs:1500});const paused=r.events.findIndex(e=>e.status==='paused');return finish([r],{realUpstreamAborted:abortedUpstream,paused:r.status==='paused',noActionsAfterPause:paused>=0&&!r.events.slice(paused+1).some(e=>e.status==='running')},['从本轮开始计算统一1.5秒暂停时点，不为每个请求重置计时。取消后无新动作才是验收条件；暂停前可能已经有快速完成的请求。']);});
 await run(9,async()=>{const initial=[{role:'user',content:'我的课程主色必须是紫色，请给出方案。'},{role:'assistant',content:'错误答案：主色选红色。'}];const a=await turn('继续讨论红色按钮。废弃分支标记：ABANDONED_RED_BRANCH。',answer,{context:initial,callBudget:2});const b=await turn('再写一段红色方案总结。废弃分支标记：ABANDONED_RED_BRANCH。',answer,{context:[...initial,{role:'user',content:'继续讨论红色按钮。废弃分支标记：ABANDONED_RED_BRANCH。'},{role:'assistant',content:a.final}],callBudget:2});const conversation={memory:'',messages:[...initial,{role:'user',content:'废弃分支标记：ABANDONED_RED_BRANCH。'},{role:'assistant',content:a.final},{role:'user',content:'红色总结'},{role:'assistant',content:b.final}]};const context=branchContext(conversation,[]);const r=await turn(initial[0].content,answer,{context,callBudget:2});return finish([a,b,r],{discardedBranchNotSent:!JSON.stringify(r.requests).includes('ABANDONED_RED_BRANCH'),purpleAnswer:/紫/.test(r.final),answered:r.status==='succeeded'},['初始错误答案为显式故障夹具；两轮后续和重试均调用真实DeepSeek。']);});
 await run(10,async()=>{const a=await turn('先介绍工作流 sandbox-workflow-001，不要运行。',answer);const b=await turn('确认启动刚才那个工作流 sandbox-workflow-001。',{action:'execute',deliverables:[]},{context:[{role:'user',content:'先介绍工作流 sandbox-workflow-001，不要运行。'},{role:'assistant',content:a.final}]});return finish([a,b],{firstDoesNotStart:a.workflowStarts.length===0,secondStartsExactlyOnce:b.workflowStarts.length===1,correctTarget:b.workflowStarts[0]?.id==='sandbox-workflow-001'},['工作流对象与启动动作是内存夹具，不运行线上工作流；自然语言确认识别不提前替模型补写。']);});
 await run(11,async()=>{const r=await turn('请调用生图工具生成一张1024x1024海报主视觉：深蓝背景，一只由金色几何线条构成的飞鸟，简洁现代，无文字。只要一张真实图片，不要网页、SVG或制作说明。',{action:'create',deliverables:[{kind:'image',format:'image'}]});return finish([r],{calledImage:r.generationInputs.some(g=>g.jobType==='image'),realFileSaved:assets.some(a=>a.case===11&&a.mimeType.startsWith('image/')),delivered:r.status==='succeeded'&&r.delivery?.artifacts.some(a=>a.kind==='image')});});
 checkpoint();console.log('ALL_ELEVEN_DONE '+JSON.stringify({textCalls,imageCalls,passed:results.filter(r=>r.verdict==='passed').length,failed:results.filter(r=>r.verdict==='failed').map(r=>r.id)}));
}
main().catch(e=>{console.error(e.message);process.exitCode=1});
