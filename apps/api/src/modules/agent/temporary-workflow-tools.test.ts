import test from 'node:test';
import assert from 'node:assert/strict';
import {platformToolDefinitions,executePlatformTool} from './agent-tools';
import {temporaryToolAudit} from './temporary-workflow-tools';
import {planTask,allowsTaskTool,assessDelivery} from './agent-policy';
import {TemporaryWorkflowService} from '../studio/temporary-workflow.service';
import {StudioService} from '../studio/studio.service';
import {AgentHarnessService} from './agent-harness.service';
const definition={nodes:[{id:'text',type:'text_constant',position:{x:0,y:0},data:{label:'文字',value:'PRIVATE_WORKFLOW_BODY'}},{id:'out',type:'text_preview',position:{x:300,y:0},data:{label:'预览'}}],edges:[{id:'a',source:'text',target:'out'}]};
test('工作流任务不会误路由为图片生成，模型只能生成和编辑草稿，不能运行或另写 JSON 冒充',()=>{
 const task=planTask({prompt:'生成一个海报工作流'});assert.deepEqual(task.deliverables,[{kind:'workflow',format:'json'}]);
 assert.equal(allowsTaskTool(task,'create_temporary_workflow'),true);assert.equal(allowsTaskTool(task,'generate_image'),false);assert.equal(allowsTaskTool(task,'start_workflow_run'),false);assert.equal(allowsTaskTool(task,'write_workspace_file'),false);
 assert.ok(platformToolDefinitions.some(t=>t.function.name==='create_temporary_workflow'));assert.ok(!platformToolDefinitions.some(t=>t.function.name==='execute_temporary_workflow'));
 const d=assessDelivery({contract:task,ledger:[{name:'create_temporary_workflow',output:{status:'succeeded',temporaryWorkflow:{id:'memory',name:'海报图',revision:1}}}],content:''});assert.equal(d.status,'succeeded');assert.equal(d.artifacts[0].kind,'workflow');
});
test('工具审计只留计数和 ID，不保存定义、参数或二进制',()=>{
 const summary=temporaryToolAudit('create_temporary_workflow',{status:'succeeded',workflow:{definition},temporaryWorkflow:{id:'memory',revision:1,nodeCount:2,edgeCount:1}});
 assert.ok(!JSON.stringify(summary).includes('PRIVATE_WORKFLOW_BODY'));assert.equal(summary.nodeCount,2);
 const read=temporaryToolAudit('read_temporary_workflow',{status:'succeeded',workflow:{definition}});assert.deepEqual(read,{status:'succeeded',tool:'read_temporary_workflow'});
});
test('真实 Harness 调用临时图工具并直接交给客户端，不自动执行或保存正式版本',async()=>{
 const actor={id:'owner',roles:['student']} as any;let generated=0;
 const generation={runJob:async()=>{generated++;throw Error('must not call image API');}};
 const db={query:async()=>{throw Error('must not write workflow graph to SQL');}};
 const temporary=new TemporaryWorkflowService(db as any,new StudioService(db as any,{} as any,generation as any),generation as any);
 const agents={claimForExecution:async()=>({createdAt:new Date().toISOString(),scenario:'chat',input:{prompt:'生成一个文字工作流',parameters:{}}}),appendAgentMessage:async()=>{},appendToolCall:async()=>{},appendArtifact:async()=>{throw Error('workflow must not create cloud file');},finishRun:async(_id:any,delivery:any)=>({status:delivery.status,delivery})};
 const adapter={id:'scripted',capabilities:['chat'],execute:async()=>({kind:'text',content:'',toolCalls:[{id:'create',type:'function',function:{name:'create_temporary_workflow',arguments:JSON.stringify({name:'测试临时图',definition,changeSummary:'创建文字预览链'})}}]})};
 const harness=new AgentHarnessService(agents as any,{getForJob:()=>adapter} as any,{} as any,{} as any,db as any,{} as any,{} as any,{} as any,generation as any,{} as any,temporary);
 const streamed:any[]=[];
 const result:any=await harness.execute(actor,'run',{mode:'server',searchEnabled:false,context:[],model:{}},{onTemporaryWorkflow:w=>streamed.push(w)});
 assert.equal(result.status,'succeeded');assert.equal(result.temporaryWorkflows.length,1);assert.equal(streamed.length,1);assert.equal(generated,0);assert.equal(result.temporaryWorkflows[0].definition.nodes.length,2);
});
