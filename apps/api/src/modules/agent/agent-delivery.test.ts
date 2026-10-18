import test from 'node:test';import assert from 'node:assert/strict';
import {runModelLoop} from './agent-runtime';import {assessDelivery,planTask} from './agent-policy';import {hasExplicitConfirmation,executePlatformTool} from './agent-tools';
import type {ModelAdapter,ModelToolCall} from '../generation/model-adapter';
const web={action:'create' as const,deliverables:[{kind:'webpage',format:'html'}]};
const call=(name:string,args:unknown):ModelToolCall=>({id:name,type:'function',function:{name,arguments:JSON.stringify(args)}});
const definitions=['write_workspace_file','check_page','generate_image'].map(name=>({type:'function' as const,function:{name,parameters:{type:'object'}}}));
test('工具参数截断不执行，完整重试后才能交付',async()=>{
 let n=0;const executed:string[]=[];
 const adapter:ModelAdapter={id:'fixture',capabilities:['chat'],execute:async()=>++n===1?{kind:'text',content:'',finishReason:'length',toolCalls:[call('write_workspace_file',{path:'bad.html'})]}:n===2?{kind:'text',content:'',toolCalls:[call('write_workspace_file',{path:'index.html'})]}:{kind:'text',content:'',toolCalls:[call('check_page',{path:'index.html'})]}};
 const result=await runModelLoop({adapter,request:{jobType:'chat',prompt:'创建网页'},tools:definitions,contract:web,executeTool:{execute:async c=>{const p=JSON.parse(c.function.arguments).path;executed.push(p);return c.function.name==='check_page'?{status:'succeeded',checkedPath:p,verdict:'pass',openUrl:'/api/preview/'+p}:{status:'succeeded',path:p,openUrl:'/api/preview/'+p};}}});
 assert.equal(result.delivery?.status,'succeeded');assert.ok(!executed.includes('bad.html'));assert.equal(n,3);
});
test('只读任务隐藏并拒绝生成工具，口头完成不算网页交付',async()=>{
 let writes=0,n=0;const adapter:ModelAdapter={id:'fixture',capabilities:['chat'],execute:async r=>{assert.ok(!r.parameters?.tools?.some(t=>t.function.name==='generate_image'));return ++n===1?{kind:'text',content:'',toolCalls:[call('generate_image',{prompt:'不应生成'})]}:{kind:'text',content:'只讨论'};}};
 await runModelLoop({adapter,request:{jobType:'chat',prompt:'只讨论'},tools:definitions,contract:{action:'answer',deliverables:[]},executeTool:{execute:async()=>{writes++;return {};}}});assert.equal(writes,0);
 assert.equal(assessDelivery({contract:web,content:'已完成',ledger:[]}).status,'failed');
});
test('检查后改CSS失效；图像只有文件必须保持待视觉核验',()=>{
 const checked={name:'check_page',output:{checkedPath:'index.html',verdict:'pass',openUrl:'/api/preview/index.html'}};
 assert.equal(assessDelivery({contract:web,ledger:[checked,{name:'write_workspace_file',output:{path:'style.css',openUrl:'/api/preview/style.css'}}]}).status,'partial');
 const image=assessDelivery({contract:{action:'create',deliverables:[{kind:'image'}]},ledger:[{name:'generate_image',output:{status:'succeeded',openUrl:'/api/image/bird',image:{mimeType:'image/png',fileName:'bird.png'}}}]});assert.equal(image.status,'partial');assert.equal(image.artifacts[0].validation,'pending_visual');
});
test('两个工具之间暂停，保留第一个文件且不再写入',async()=>{
 const control=new AbortController();let writes=0;
 const adapter:ModelAdapter={id:'fixture',capabilities:['chat'],execute:async()=>({kind:'text',content:'',toolCalls:[call('write_workspace_file',{path:'one.html'}),call('write_workspace_file',{path:'two.html'})]})};
 const result=await runModelLoop({adapter,request:{jobType:'chat',prompt:'创建网页',signal:control.signal},contract:web,tools:definitions,executeTool:{execute:async()=>{writes++;control.abort();return {path:'one.html',openUrl:'/api/preview/one.html'};}}});assert.equal(writes,1);assert.equal(result.delivery?.status,'paused');assert.equal(result.delivery?.artifacts.length,1);
});
test('复合产物和普通中文确认被识别，修复任务不受模式标签阻断',()=>{
 assert.equal(planTask({prompt:'生成Word教案和课程网页'}).deliverables.length,2);assert.equal(planTask({prompt:'不要生成图片，只解释构图'}).action,'answer');assert.equal(planTask({prompt:'我确认，启动工作流 workflow-1'}).action,'execute');assert.equal(planTask({prompt:'修复这个网页'}).action,'modify');
});
for(const [prompt,allowed] of [['确认启动刚才那个工作流 workflow-1。',true],['我确认，启动工作流 workflow-1。',true],['不要确认启动 workflow-1',false],['确认启动 workflow-10',false],['解释“确认启动 workflow-1”的意思',false],['确认启动 workflow-1？',false]] as const)test('确认绑定动作与目标：'+prompt,()=>assert.equal(hasExplicitConfirmation({round:1,request:{jobType:'chat'},messages:[{role:'user',content:prompt}]},'workflow-1'),allowed));
for(const [name,html] of [['外部CSS','<style>body{background:url(https://example.com/a.png)}</style>'],['脚本联网','<style>body{color:red}</style><script>fetch("https://example.com")</script>'],['空样式','<style> /*空*/ </style><h1>页面</h1>']])test('网页补充检查：'+name,async()=>{
 const output=await executePlatformTool(call('check_page',{path:'index.html'}),{round:1,request:{jobType:'chat'},messages:[]},{actor:{id:'fixture'},workspace:{read:async()=>({path:'index.html',content:html}),statFile:async()=>null,openUrl:(p:string)=>'/api/preview/'+p}} as any);assert.ok('verdict' in output);assert.equal(output.verdict,'fail');
});
