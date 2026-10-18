/** All eleven cases against the actual workspace Harness/tools. Scripted adapters, no paid calls. */
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {session} from './audit-agent-20261018';
const previous=JSON.parse(fs.readFileSync(path.resolve('local-artifacts/agent-sandbox-20261018/repair/round-3/results.json'),'utf8'));
const filesFor=(id:number)=>previous.results.find(c=>c.id===id).turns.at(-1).files;
const tool=(name:string,args:any)=>({kind:'text',content:'',toolCalls:[{id:'call-'+name,type:'function',function:{name,arguments:JSON.stringify(args)}}]});
const text=(content='完成',extra:any={})=>({kind:'text',content,...extra});
const out=path.resolve('local-artifacts/agent-workspace-20261018');fs.mkdirSync(out,{recursive:true});
async function main(){const cases:any[]=[];
 const run=async(id:number,prompt:string,steps:any[],options:any,validate:(r:any)=>void)=>{
  const r=await session(steps,{prompt,...options});let error='';try{validate(r);}catch(e){error=String(e);}
  cases.push({id,prompt,passed:!error,error,status:r.result.status,delivery:r.result.delivery,content:r.result.messages?.filter(m=>m.role==='agent').at(-1)?.content,events:r.events,files:r.files,modelCalls:r.modelCalls,toolCalls:r.toolCalls});
  console.log(JSON.stringify({id,passed:!error,status:r.result.status,error}));
 };
 await run(1,'不要生成图片，只解释这张海报的构图思路',[text('没有看到图片；仅根据文字描述分析构图。')],{},r=>{assert.equal(r.result.status,'succeeded');assert.equal(r.generationInputs.length,0);});
 await run(2,'解释PDF、Word、PPT适用场景，不要创建文件',[text('PDF适合阅读，Word适合编辑，PPT适合演示。')],{},r=>{assert.equal(r.result.status,'succeeded');assert.equal(r.files.length,0);});
 const gallery=filesFor(3),html=gallery.find(f=>/\.html$/.test(f[0]))[0];
 await run(3,'创建包含6件作品、分类筛选和详情的学生作品画廊网页',[tool('write_workspace_files',{files:gallery.map(([path,content])=>({path,content}))}),tool('check_page',{path:html})],{},r=>{assert.equal(r.result.status,'succeeded');assert.equal(r.result.delivery.artifacts.find(a=>a.kind==='webpage').validation,'pass');});
 await run(4,'改成深色，按钮换紫色，保留其他功能',[tool('read_workspace_file',{path:html}),tool('write_workspace_files',{files:filesFor(4).map(([path,content])=>({path,content}))}),tool('check_page',{path:html})],{files:Object.fromEntries(gallery),parameters:{previousTask:{artifacts:[{kind:'webpage',path:html}]}}},r=>assert.equal(r.result.status,'succeeded'));
 const course=filesFor(5),coursePath=course.find(f=>/\.html$/.test(f[0]))[0];
 await run(5,'根据刚才讨论，生成Word教案和课程介绍网页',[tool('generate_document',{prompt:'根据讨论生成教案',format:'docx'}),tool('write_workspace_files',{files:course.map(([path,content])=>({path,content}))}),tool('check_page',{path:coursePath})],{context:[{role:'user',content:'传统纹样，初中生45分钟；观察10、重组25、评价10；识别重复规律、完成重组、说明设计意图。'}]},r=>{assert.equal(r.result.status,'succeeded');assert.ok(r.generationInputs[0].context.some(m=>m.content.includes('初中生')));assert.equal(r.result.delivery.artifacts.filter(a=>['webpage','document'].includes(a.kind)).length,2);});
 const repaired=filesFor(6),repairPath=repaired.find(f=>/\.html$/.test(f[0]))[0];
 await run(6,'修复这个网页的样式与按钮脚本错误',[tool('read_workspace_file',{path:repairPath}),tool('write_workspace_files',{files:repaired.map(([path,content])=>({path,content}))}),tool('check_page',{path:repairPath})],{files:{[repairPath]:'<link rel="stylesheet" href="missing.css"><h1>作品展</h1><button id="b">0</button><script>const = ;</script>'}},r=>assert.equal(r.result.status,'succeeded'));
 await run(7,'制作40件作品的交互画廊网页，预算不足请保留成果并说明',[tool('write_workspace_file',{path:'index.html',content:'<style>body{color:#123}</style><h1>待完善画廊</h1>'}),text('',{finishReason:'length'}),text('尚未完成，缺少筛选与详情检查')],{parameters:{callBudget:3}},r=>{assert.equal(r.result.status,'partial');assert.ok(r.modelCalls<=3);assert.ok(r.result.delivery.artifacts.length);});
 const control=new AbortController();
 await run(8,'创建40件作品的交互画廊网页',[],{signal:control.signal,adapter:{id:'cancel-test',capabilities:['chat'],execute:async()=>{control.abort();throw Error('用户暂停');}}},r=>{assert.equal(r.result.status,'paused');assert.equal(r.files.length,0);assert.equal(r.modelCalls,1);});
 await run(9,'只讨论课程紫色主色',[text('本次课程保留紫色主色。')],{context:[{role:'user',content:'课程主色是紫色。'}]},r=>{assert.equal(r.result.status,'succeeded');assert.ok(!JSON.stringify(r.requests).includes('ABANDONED_RED_BRANCH'));});
 let starts=0;
 const intro=await session([tool('get_workflow_detail',{workflowId:'sandbox-workflow-001'}),text('该工作流整理需求并生成海报，尚未启动。')],{prompt:'先介绍工作流 sandbox-workflow-001，不要运行'});starts+=intro.workflowStarts.length;
 await run(10,'确认启动刚才那个工作流 sandbox-workflow-001。',[tool('start_workflow_run',{workflowId:'sandbox-workflow-001'}),tool('start_workflow_run',{workflowId:'sandbox-workflow-001'}),text('已启动一次。')],{},r=>{assert.equal(starts,0);assert.equal(r.workflowStarts.length,1);assert.equal(r.result.status,'succeeded');});
 await run(11,'调用生图工具生成一张1024x1024深蓝背景金色几何飞鸟图片，无文字',[tool('generate_image',{prompt:'深蓝背景，金色几何飞鸟，无文字',size:'1024x1024'}),text('已生成图片，视觉待核验。')],{},r=>{assert.equal(r.generationInputs.length,1);assert.equal(r.result.status,'partial');assert.equal(r.result.delivery.artifacts[0].validation,'pending_visual');});
 const result={mode:'actual-workspace-harness; scripted model and isolated services; no external API calls',tests:11,passed:cases.filter(c=>c.passed).length,cases};fs.writeFileSync(path.join(out,'eleven-results.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({tests:11,passed:result.passed}));if(result.passed!==11)process.exitCode=1;
}
main().catch(e=>{console.error(e);process.exitCode=1});
