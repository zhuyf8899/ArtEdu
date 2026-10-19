import test from 'node:test';import assert from 'node:assert/strict';
import {planTask,composeAgentPrompt} from './agent-policy';import {runModelLoop} from './agent-runtime';import type {ModelAdapter} from '../generation/model-adapter';
for(const mixed of [false,true])test('图片配置错误仅调用一次，停止重试并保留已有产物 '+mixed,async()=>{
 let models=0,images=0;
 const prompt=mixed?'生图并制作网页展示图片':'生成一张图片，不要SVG';
 const contract=planTask({prompt});
 const adapter:ModelAdapter={id:'fixture',capabilities:['chat'],execute:async()=>{
   models++;
   const name=mixed&&models===1?'write_workspace_file':'generate_image';
   return {kind:'text',content:'',toolCalls:[{id:String(models),type:'function',function:{name,arguments:'{}'}}]};
 }};
 const result=await runModelLoop({adapter,request:{jobType:'chat',prompt},contract,
   tools:['write_workspace_file','generate_image'].map(name=>({type:'function' as const,function:{name,parameters:{type:'object'}}})),
   executeTool:{execute:async call=>{
     if(call.function.name==='write_workspace_file')return {path:'index.html',openUrl:'/api/private/index.html'};
     images++;return {status:'failed',code:'IMAGE_PROVIDER_KEY_MISSING',retryable:false,error:'图片服务密钥尚未配置，请联系管理员'};
   }},maxRounds:8});
 assert.equal(images,1);assert.equal(models,mixed?2:1);
 assert.equal(result.delivery?.status,mixed?'partial':'failed');
 assert.match(result.delivery?.reason??'',/密钥尚未配置/);
 assert.equal(result.delivery?.artifacts.some(a=>a.path==='index.html'),mixed);
 assert.ok(!result.content.includes('暂停'));
});
for(const prompt of ['生成一张图片，不要SVG，也不要前端UI文件','请调用生图API，画一只猫','帮我生图：一只猫','画一张照片','生成一张首页UI设计图','生成网页截图风格的图片'])test(prompt,()=>assert.deepEqual(planTask({prompt}).deliverables.map(d=>d.kind),['image']));
for(const prompt of ['不要生图，只解释构图','解释“生成SVG”的意思'])test(prompt,()=>assert.equal(planTask({prompt}).action,'answer'));
test('SVG和混合网页',()=>{assert.deepEqual(planTask({prompt:'用SVG绘制一只猫'}).deliverables.map(d=>d.kind),['graphic']);assert.deepEqual(planTask({prompt:'生图并制作网页展示图片'}).deliverables.map(d=>d.kind),['webpage','image']);});
for(const failed of [false,true])test('拒绝替代工具并调用图片API '+failed,async()=>{
 let n=0;const executed:string[]=[];const contract=planTask({prompt:'生成一张图片，不要SVG'});
 const adapter:ModelAdapter={id:'fixture',capabilities:['chat'],execute:async r=>{assert.ok(!r.parameters?.tools?.some(t=>t.function.name==='write_workspace_file'));assert.ok(!JSON.stringify(r.messages).includes('网页可分HTML'));const name=++n===1?'write_workspace_file':n===2?'generate_image':null;return {kind:'text',content:name?'':'结束',...(name?{toolCalls:[{id:String(n),type:'function' as const,function:{name,arguments:'{}'}}]}:{})};}};
 const result=await runModelLoop({adapter,request:{jobType:'chat',messages:[{role:'system',content:composeAgentPrompt({contract})}]},contract,maxRounds:4,tools:['write_workspace_file','generate_image'].map(name=>({type:'function' as const,function:{name,parameters:{type:'object'}}})),executeTool:{execute:async c=>{executed.push(c.function.name);return failed?{status:'failed',error:'provider unavailable'}:{status:'succeeded',image:{mimeType:'image/png',fileName:'cat.png'},openUrl:'/api/image/cat',visualValidation:'pending_visual'};}}});assert.deepEqual(executed,['generate_image']);assert.equal(result.delivery?.status,failed?'failed':'partial');assert.ok(!result.delivery?.artifacts.some(a=>a.kind==='graphic'||a.kind==='webpage'));
});
