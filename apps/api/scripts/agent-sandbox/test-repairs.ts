import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';
import {session} from '../audit-agent-20261018';
import {buildCandidate} from './build-candidate';
import {workflowAuthorization} from './tools';
import {assessDelivery} from './policy.mjs';
const text=(content='完成',extra:any={})=>({kind:'text',content,...extra});
const tool=(name:string,args:any)=>text('',{toolCalls:[{id:'call',type:'function',function:{name,arguments:JSON.stringify(args)}}]});
async function main(){
 const Harness=await buildCandidate(),checks:any[]=[];
 const check=async(name:string,fn:()=>any)=>{try{await fn();checks.push({name,passed:true});}catch(e){checks.push({name,passed:false,error:String(e)});}};
 const opts={harnessClass:Harness,parameters:{sandboxRecovery:true,sandboxRounds:8,sandboxContract:{action:'create',deliverables:[{kind:'webpage',format:'html'}]}},prompt:'创建网页'};
 await check('截断批次不落盘，后续完整重试可交付',async()=>{
  const r=await session([text('',{finishReason:'length',toolCalls:[{id:'bad',type:'function',function:{name:'write_workspace_file',arguments:'{"path":"bad.html"'}}]}),tool('write_workspace_file',{path:'index.html',content:'<style>body{color:#123}</style><h1>恢复成功</h1>'}),tool('check_page',{path:'index.html'})],opts);
  assert.equal(r.result.status,'succeeded');assert.equal(r.files.length,1);assert.equal(r.files[0][0],'index.html');
 });
 await check('仅修改CSS后检查现有HTML也可交付',async()=>{
  const r=await session([tool('write_workspace_file',{path:'style.css',content:'body{color:purple}'}),tool('check_page',{path:'index.html'})],{...opts,files:{'index.html':'<link rel="stylesheet" href="style.css"><h1>保留页面</h1>','style.css':'body{color:red}'}});assert.equal(r.result.status,'succeeded');
 });
 await check('CSS变更使之前HTML检查失效',()=>{
  const r=assessDelivery({contract:{action:'modify',deliverables:[{kind:'webpage',format:'html',path:'index.html'}]},ledger:[{name:'check_page',output:{status:'succeeded',checkedPath:'index.html',verdict:'pass',openUrl:'/api/preview/index.html'}},{name:'write_workspace_file',output:{status:'succeeded',path:'style.css',openUrl:'/api/preview/style.css'}}]});assert.equal(r.status,'partial');
 });
 await check('第2轮真实筛选故障可被发现并修复',async()=>{
  const prior=JSON.parse(fs.readFileSync(path.resolve('local-artifacts/agent-sandbox-20261018/repair/round-2/results.json'),'utf8'));
  const files=prior.results.find(c=>c.id===3).turns[0].files;
  const html=files.find(f=>/\.html$/.test(f[0]))[0],css=files.find(f=>/\.css$/.test(f[0]));
  const r=await session([tool('check_page',{path:html}),tool('write_workspace_file',{path:css[0],content:css[1]+'\n[hidden]{display:none!important}'}),tool('check_page',{path:html})],{...opts,files:Object.fromEntries(files)});
  assert.equal(r.result.status,'succeeded');const checks=r.toolCalls.filter(c=>c.name==='check_page');assert.equal(checks[0].output.verdict,'fail');assert.ok(checks[0].output.issues.some(i=>i.message.includes('filterActuallyChanges')));assert.equal(checks[1].output.verdict,'pass');
 });
 for(const [prompt,expected] of [['确认启动刚才那个工作流 workflow-001。',true],['我同意运行 workflow-001',true],['不要确认启动 workflow-001',false],['确认启动 workflow-002',false],['确认启动 workflow-0010',false],['解释“确认启动 workflow-001”的含义',false],['确认启动 workflow-001？',false],['确认取消 workflow-001',false]] as const)await check('动作确认：'+prompt,()=>assert.equal(workflowAuthorization(prompt,'workflow-001'),expected));
 await check('仅声称启动不算真实执行',()=>assert.equal(assessDelivery({contract:{action:'execute',deliverables:[]},content:'已启动',ledger:[]}).status,'failed'));
 await check('真实工具确认启动一次',async()=>{const r=await session([tool('start_workflow_run',{workflowId:'workflow-001'}),text()],{...opts,prompt:'确认启动刚才那个工作流 workflow-001。',parameters:{sandboxRecovery:true,sandboxRounds:5,sandboxContract:{action:'execute',deliverables:[]}}});assert.equal(r.workflowStarts.length,1);assert.equal(r.result.status,'succeeded');});
 await check('模型重复要求启动不产生重复副作用',async()=>{const r=await session([tool('start_workflow_run',{workflowId:'workflow-001'}),tool('start_workflow_run',{workflowId:'workflow-001'}),text()],{...opts,prompt:'确认启动刚才那个工作流 workflow-001。',parameters:{sandboxRecovery:true,sandboxRounds:5,sandboxContract:{action:'execute',deliverables:[]}}});assert.equal(r.workflowStarts.length,1);});
 for(const status of ['pass','fail'])await check('图片视觉复核 '+status,async()=>{const r=await session([tool('generate_image',{prompt:'无文字飞鸟'}),text('完成')],{...opts,parameters:{sandboxRecovery:true,sandboxRounds:4,sandboxContract:{action:'create',deliverables:[{kind:'image',format:'image'}]}},runGeneration:async()=>({job:{status:'succeeded'},artifact:{fileName:'bird.png',mimeType:'image/png',downloadUrl:'/api/test/bird.png'},visualReview:{status,issues:status==='fail'?['出现水印']:[]}})});assert.equal(r.result.status,status==='pass'?'succeeded':'partial');assert.equal(r.generationInputs.length,1);});
 const result={tests:checks.length,passed:checks.filter(c=>c.passed).length,checks};
 fs.writeFileSync(path.resolve('local-artifacts/agent-sandbox-20261018/repair-unit-results.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));if(result.passed!==result.tests)process.exitCode=1;
}
main().catch(e=>{console.error(e);process.exitCode=1});
