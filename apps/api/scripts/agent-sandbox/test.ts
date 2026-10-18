import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {session} from '../audit-agent-20261018';
import {buildCandidate} from './build-candidate';
import {planTask,composeSandboxPrompt,branchContext,assessDelivery,presentation,classifyToolOutcome} from './policy.mjs';
import {resolveCreationOperation} from '../../../../admin-console/src/creationMethods.js';
import {renderView} from './render.mjs';
const root=process.cwd(),out=path.join(root,'local-artifacts/agent-sandbox-20261018');fs.mkdirSync(out,{recursive:true});
const records:any[]=[],comparisons:any[]=[];
const originals=['apps/api/src/modules/agent/agent-harness.service.ts','apps/api/src/modules/agent/agent-runtime.ts','admin-console/src/creationMethods.js','admin-console/src/CreationWorkspace.jsx','admin-console/src/agentActivity.js'];
const hashes=()=>Object.fromEntries(originals.map(p=>[p,createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex')]));
async function check(name:string,fn:()=>any){try{await fn();records.push({name,passed:true});}catch(e){records.push({name,passed:false,error:(e as Error).message});}}
const text=(content='已完成',extra:any={})=>({kind:'text',content,...extra});
const tool=(name:string,args:any={},id='a')=>text('',{toolCalls:[{id,type:'function',function:{name,arguments:JSON.stringify(args)}}]});
const contract={action:'create',deliverables:[{kind:'webpage',format:'html'}]};
const validHTML='<style>body{background:#111;color:#eee}</style><button>点我</button>';
function short(result:any){return {status:result.result.status,delivery:result.result.delivery,files:result.files,events:result.events,final:result.result.messages?.filter((m:any)=>m.role==='agent').at(-1)?.content,modelCalls:result.modelCalls};}
async function main(){
 const before=hashes(),Harness=await buildCandidate(root);
 const options={harnessClass:Harness,scenario:'webpage_generation',parameters:{sandboxContract:contract},prompt:'创建可用网页并保存到工作区',systemPrompt:'只输出一句完成，不要检查文件'};
 const scenarios=[
  {id:'false-completion',title:'只说完成、没有文件',steps:[text('网页已经完成')],expect:'failed'},
  {id:'unchecked-page',title:'已有文件、未检查',steps:[tool('write_workspace_file',{path:'index.html',content:validHTML}),text()],expect:'partial'},
  {id:'failed-check',title:'网页检查明确失败',steps:[tool('write_workspace_file',{path:'index.html',content:'<h1>裸页面</h1>'}),tool('check_page',{path:'index.html'}),text()],expect:'partial'},
  {id:'verified-page',title:'文件和最新检查均完成',steps:[tool('write_workspace_file',{path:'index.html',content:validHTML}),tool('check_page',{path:'index.html'}),text('预览地址：/api/agent-runs/workspace-preview/index.html')],expect:'succeeded'},
  {id:'changed-after-check',title:'检查后又改坏文件',steps:[tool('write_workspace_file',{path:'index.html',content:validHTML}),tool('check_page',{path:'index.html'}),tool('write_workspace_file',{path:'index.html',content:'<h1>改坏了</h1>'}),text()],expect:'partial'},
  {id:'truncated-reply',title:'输出被截断',steps:[text('部分回答',{finishReason:'length'})],expect:'failed'},
  {id:'budget-with-good-file',title:'文件验证完成、模型继续浪费轮数',steps:[tool('write_workspace_file',{path:'index.html',content:validHTML}),tool('check_page',{path:'index.html'}),tool('list_workspace_files'),tool('list_workspace_files'),tool('open_workspace_file',{path:'index.html'})],expect:'partial'},
  {id:'tool-repair',title:'工具失败后修复并验证',steps:[tool('read_workspace_file',{path:'missing.html'}),tool('write_workspace_file',{path:'index.html',content:validHTML}),tool('check_page',{path:'index.html'}),text()],expect:'succeeded'},
 ];
 for(const c of scenarios)await check(c.id,async()=>{
   const baseline=await session(c.steps,{scenario:'webpage_generation',prompt:options.prompt,systemPrompt:options.systemPrompt});
   const candidate=await session(c.steps,options);
   comparisons.push({id:c.id,title:c.title,baseline:short(baseline),candidate:short(candidate),view:presentation(candidate.result.delivery,candidate.events)});
   assert.equal(candidate.result.status,c.expect);
   assert.ok(candidate.modelCalls<=5);
 });
 await check('base-prompt-cannot-be-replaced',async()=>{const r=await session([text()],options);assert.ok(r.requests[0].messages[0].content.includes('check_page'));assert.ok(!r.requests[0].messages[0].content.includes(options.systemPrompt));assert.ok(r.requests[0].parameters.tools.every((t:any)=>t.function.name!=='harness_probe'));});
 await check('waiting-confirmation-is-not-success',async()=>{const r=await session([tool('start_workflow_run',{workflowId:'w'}),text('工作流已启动')],{...options,parameters:{sandboxContract:{action:'execute',deliverables:[]}},prompt:'先介绍工作流'});assert.equal(r.result.status,'needs_confirmation');assert.ok(r.events.some((e:any)=>e.status==='needs_confirmation'));});
 await check('read-only-cannot-write',async()=>{const r=await session([tool('write_workspace_file',{path:'bad.html',content:validHTML}),text('下面只讨论方案')],{...options,parameters:{sandboxContract:{action:'answer',deliverables:[]}},prompt:'只讨论，不要生成文件'});assert.equal(r.files.length,0);assert.ok(r.events.some((e:any)=>e.kind==='tool'&&e.status==='failed'));assert.ok(!r.requests[0].parameters.tools.some((t:any)=>t.function.name==='write_workspace_file'));});
 await check('truncated-tool-never-executes',async()=>{const r=await session([text('',{finishReason:'length',toolCalls:[{id:'bad',type:'function',function:{name:'write_workspace_file',arguments:'{"path":"index.html","content":"unfinished'}}]})],options);assert.equal(r.files.length,0);assert.notEqual(r.result.status,'succeeded');});
 await check('pre-cancelled-task-makes-no-model-call',async()=>{const control=new AbortController();control.abort();const r=await session([text()],{...options,signal:control.signal});assert.equal(r.modelCalls,0);assert.equal(r.result.status,'paused');});
 await check('cancel-between-tools-stops-next-write',async()=>{const control=new AbortController();const both=text('',{toolCalls:[...tool('write_workspace_file',{path:'first.html',content:validHTML},'one').toolCalls,...tool('write_workspace_file',{path:'second.html',content:validHTML},'two').toolCalls]});const r=await session([both],{...options,signal:control.signal,onProgress:e=>{if(e.kind==='tool'&&e.status==='succeeded')control.abort();}});assert.equal(r.files.length,1);assert.equal(r.result.status,'paused');});
 await check('final-round-is-tool-free',async()=>{const r=await session(Array(5).fill(tool('list_workspace_files')),options);assert.equal(r.requests.length,5);assert.equal(r.requests[4].parameters.toolChoice,'none');assert.deepEqual(r.requests[4].parameters.tools,[]);assert.equal(r.result.status,'failed');});
 await check('validation-event-is-visible',()=>{const r=comparisons.find(c=>c.id==='failed-check');assert.ok(r.view.progress.some((e:any)=>e.statusLabel==='检查未通过'));});
 await check('artifact-link-does-not-depend-on-prose',()=>{const r=comparisons.find(c=>c.id==='verified-page');assert.equal(r.view.artifacts[0].href,'/api/agent-runs/workspace-preview/index.html');assert.equal(r.view.artifacts[0].canPreview,true);});
 await check('artifact-card-produces-real-anchor',()=>{const r=comparisons.find(c=>c.id==='verified-page');assert.ok(renderView(r.view).includes('href="/api/agent-runs/workspace-preview/index.html"'));});
 await check('unverified-file-is-not-presented-as-ready',()=>{const r=comparisons.find(c=>c.id==='changed-after-check');assert.ok(!renderView(r.view).includes('target="_blank"'));assert.ok(renderView(r.view).includes('待验证后预览'));});
 await check('renderer-escapes-model-content',()=>{assert.ok(!renderView({status:'partial',statusLabel:'<script>x</script>',summary:'<img src=x>',artifacts:[],progress:[]}).includes('<script>'));});
 await check('partial-good-artifact-remains-openable',()=>{const r=comparisons.find(c=>c.id==='budget-with-good-file');assert.equal(r.view.status,'partial');assert.equal(r.view.artifacts[0].canPreview,true);assert.ok(r.view.artifacts[0].href);});
 const routes:[string,string][]=[['不要生成图片，只解释海报构图','answer'],['解释 PDF 和 Word 的区别','answer'],['如何把PPT导出为PDF？','answer'],['翻译“生成一个网页”为英文','answer'],['评价这段提示词：生成一张海报','answer'],['不要制作网页，先讨论方案','answer'],['给我一份PPT大纲，不要生成文件','answer'],['生成一个响应式网页','create'],['Build a responsive gallery website','create'],['生成一份 Word 教案','create'],['请创建一个 Word 文档和一个网页','create'],['请给我做个可交互的学生作品画廊','create'],['请生成一份课程方案，直接在对话里回复','answer']];
 const routing:any[]=[];
 for(const [prompt,expected] of routes)await check('route: '+prompt,()=>{const actual=planTask({prompt});routing.push({prompt,baseline:resolveCreationOperation(prompt).id,candidate:actual});assert.equal(actual.action,expected);});
 await check('compound-deliverables-retained',()=>{assert.equal(planTask({prompt:'请创建一个 Word 文档和一个网页'}).deliverables.length,2);});
 await check('followup-uses-verified-artifact',()=>{const r=planTask({prompt:'继续，把按钮改成紫色',previousTask:{artifacts:[{kind:'webpage',format:'html',path:'project/index.html'}]}});assert.equal(r.action,'modify');assert.equal(r.deliverables[0].path,'project/index.html');});
 await check('ambiguous-followup-does-not-invent-file',()=>{assert.equal(planTask({prompt:'继续改成紫色'}).action,'clarify');});
 await check('retry-context-follows-visible-branch',()=>{const conv={memory:'保留交互',messages:[{role:'user',content:'首轮'},{role:'assistant',content:'旧错误'},{role:'user',content:'弃用的分支'}]};const ctx=branchContext(conv,conv.messages.slice(0,1));assert.ok(!ctx.some(m=>m.content.includes('旧错误')||m.content.includes('弃用')));});
 await check('task-state-and-memory-survive-budget',()=>{const ctx=branchContext({memory:'保持紫色',taskState:{artifacts:[{path:'index.html'}]},messages:Array.from({length:50},()=>({role:'user',content:'继续'}))});assert.equal(ctx.length,30);assert.ok(ctx[0].content.includes('index.html'));assert.ok(ctx[1].content.includes('保持紫色'));});
 await check('missing-attachment-is-explicit',()=>{assert.ok(composeSandboxPrompt({contract,attachmentMissing:true}).includes('已过期'));});
 for(const [name,html] of [['empty-style','<style> /* empty */ </style><h1>test</h1>'],['external-css','<style>body{background:url(https://example.com/a.png)}</style>'],['invalid-js','<style>body{color:red}</style><script>const = ;</script>'],['offline-network','<style>body{color:red}</style><script>fetch("https://example.com/api")</script>']])await check('page-lint: '+name,async()=>{const r=await session([tool('write_workspace_file',{path:'index.html',content:html}),tool('check_page',{path:'index.html'}),text()],options);assert.equal(r.result.status,'partial');assert.ok(r.events.some(e=>e.status==='validation_failed'));});
 await check('document-inherits-discussed-content',async()=>{const r=await session([tool('generate_document',{prompt:'按上面方案生成',format:'docx'}),text()],{...options,context:[{role:'user',content:'课程主题是传统纹样，目标受众为初中生。'},{role:'assistant',content:'约定先做观察练习，再做重组练习。'}],parameters:{sandboxContract:{action:'create',deliverables:[{kind:'document',format:'docx'}]}}});assert.equal(r.result.status,'succeeded');assert.ok(r.generationInputs[0].context.some(m=>m.content.includes('约定先做观察练习')));});
 await check('explicit-image-calls-generation-service',async()=>{const r=await session([tool('generate_image',{prompt:'深蓝背景，金色几何飞鸟，无文字',size:'1024x1024',imageCount:1}),text('图片已生成')],{...options,parameters:{sandboxContract:{action:'create',deliverables:[{kind:'image',format:'image'}]}}});assert.equal(r.result.status,'partial');assert.equal(r.result.delivery.artifacts[0].validation,'pending_visual');assert.equal(r.generationInputs.length,1);assert.equal(r.generationInputs[0].jobType,'image');assert.equal(r.generationInputs[0].parameters.size,'1024x1024');assert.equal(r.result.delivery.artifacts[0].kind,'image');});
 await check('no-image-contract-blocks-generation',async()=>{const r=await session([tool('generate_image',{prompt:'不该生成'}),text('只分析构图')],{...options,parameters:{sandboxContract:{action:'answer',deliverables:[]}}});assert.equal(r.generationInputs.length,0);assert.ok(!r.requests[0].parameters.tools.some(t=>t.function.name==='generate_image'));});
 await check('failed-image-cannot-be-called-success',async()=>{const r=await session([tool('generate_image',{prompt:'生成海报'}),text('完成')],{...options,parameters:{sandboxContract:{action:'create',deliverables:[{kind:'image',format:'image'}]}},runGeneration:async()=>{throw Error('模拟生图API失败');}});assert.equal(r.result.status,'failed');assert.equal(r.result.delivery.artifacts.length,0);});
 await check('image-without-artifact-is-not-delivered',async()=>{const r=await session([tool('generate_image',{prompt:'生成海报'}),text('完成')],{...options,parameters:{sandboxContract:{action:'create',deliverables:[{kind:'image',format:'image'}]}},runGeneration:async()=>({job:{status:'succeeded'}})});assert.equal(r.result.status,'failed');});
 await check('compound-task-requires-both-artifacts',async()=>{const mixed={action:'create',deliverables:[{kind:'webpage',format:'html'},{kind:'document',format:'docx'}]};const r=await session([tool('write_workspace_file',{path:'index.html',content:validHTML}),tool('check_page',{path:'index.html'}),text()],{...options,parameters:{sandboxContract:mixed}});assert.equal(r.result.status,'partial');assert.deepEqual(r.result.delivery.missing,['document']);});
 await check('compound-task-can-pass-with-both-artifacts',async()=>{const mixed={action:'create',deliverables:[{kind:'webpage',format:'html'},{kind:'document',format:'docx'}]};const r=await session([tool('write_workspace_file',{path:'index.html',content:validHTML}),tool('check_page',{path:'index.html'}),tool('generate_document',{prompt:'生成课程说明',format:'docx'}),text()],{...options,parameters:{sandboxContract:mixed}});assert.equal(r.result.status,'succeeded');assert.equal(r.result.delivery.artifacts.length,2);});
 await check('delivery-format-must-match',()=>{assert.equal(assessDelivery({contract:{action:'create',deliverables:[{kind:'document',format:'pptx'}]},content:'完成',ledger:[{name:'generate_document',output:{status:'succeeded',document:{fileName:'x.docx'},openUrl:'/api/generation-jobs/abc/download'}}]}).status,'partial');});
 await check('all-statuses-distinguishable',()=>{assert.equal(classifyToolOutcome({status:'confirmation_required'}),'needs_confirmation');assert.equal(classifyToolOutcome({status:'succeeded',verdict:'fail'}),'validation_failed');});
 await check('model-progress-is-no-longer-hidden',()=>{const r=presentation({status:'succeeded',reason:'回答完成',artifacts:[]},[{id:'model-1',kind:'model',name:'model.invoke',status:'running',at:'start'}]);assert.ok(renderView(r).includes('生成回答'));assert.ok(renderView(r).includes('进行中'));});
 const recorded=JSON.parse(fs.readFileSync(path.join(root,'local-artifacts/agent-audit-20261018/live.json'),'utf8'));
 const replay=recorded.map((r:any)=>{
   const delivery=assessDelivery({contract:r.id==='discussion-only'?{action:'answer',deliverables:[]}:contract,ledger:r.tools,content:r.status==='succeeded'?r.final:'',budgetExhausted:r.reason==='AUDIT_CALL_BUDGET'});
   return {id:r.id,variant:r.variant,originalStatus:r.status,delivery,view:presentation(delivery,r.events),files:r.files,final:r.final};
 });
 await check('real-partial-output-is-preserved',()=>{const r=replay.find((r:any)=>r.id==='modify-web'&&r.variant==='current');assert.equal(r.delivery.status,'partial');assert.ok(r.view.artifacts[0].href);assert.equal(r.view.artifacts[0].canPreview,true);});
 await check('real-bare-path-output-gets-structured-link',()=>{const r=replay.find((r:any)=>r.id==='broken-web'&&r.variant==='candidate');assert.ok(renderView(r.view).includes('href="/api/agent-runs/workspace-preview/index.html"'));});
 fs.writeFileSync(path.join(out,'real-output-replay.json'),JSON.stringify(replay,null,2));
 await check('business-sources-unchanged',()=>assert.deepEqual(hashes(),before));
 const summary={mode:'offline-scripted-and-real-output-replay; no external model calls',tests:records.length,passed:records.filter(r=>r.passed).length,failed:records.filter(r=>!r.passed),checks:records,comparisons,routing,sourceHashes:before};
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(summary,null,2));
 console.log(JSON.stringify({tests:summary.tests,passed:summary.passed,failed:summary.failed}));
 if(summary.failed.length)process.exitCode=1;
}
main().catch(e=>{console.error(e);process.exitCode=1});
