import 'reflect-metadata';
import {test} from 'node:test';import assert from 'node:assert/strict';
import {readKnowledgeGraph} from './knowledge-graph-tool';import {platformToolDefinitions,availablePlatformToolDefinitions,executePlatformTool} from './agent-tools';
import {allowsTaskTool,isMutation} from './agent-policy';import {AgentHarnessService} from './agent-harness.service';
const actor={id:'student',roles:['student']} as any;
const nodes=['a','b','c','d'].map((id,i)=>({id,title:id==='a'?'用户观察':id,description:'知识说明',tags:id==='a'?['研究']:[],showInNetwork:i<3,progressPercent:0,evidenceCount:0}));
const map={nodes,edges:[{fromNodeId:'a',toNodeId:'b',relation:'related'},{fromNodeId:'b',toNodeId:'c',relation:'related'},{fromNodeId:'c',toNodeId:'a',relation:'related'},{fromNodeId:'a',toNodeId:'d',relation:'related'}],bindings:[{nodeId:'a',targetType:'course',targetId:'course',title:'用户研究课程',href:'/learning?course=course'},{nodeId:'a',targetType:'workflow',targetId:'workflow'}]};
const knowledge={getMap:async(received:any)=>{assert.equal(received.id,actor.id);return map;}} as any;
const db={query:async(sql:string)=>{assert.equal(sql,'SELECT enabled FROM comfy_feature_settings WHERE id=true');return {rows:[{enabled:false}]};}} as any;
test('registered graph tool is read-only, remains available when ComfyUI is off, and returns a cyclic graph with actual course links',async()=>{
 assert.ok(platformToolDefinitions.some(tool=>tool.function.name==='get_knowledge_graph'));assert.equal(isMutation('get_knowledge_graph'),false);assert.equal(allowsTaskTool({action:'answer',deliverables:[]},'get_knowledge_graph'),true);
 assert.ok((await availablePlatformToolDefinitions(db)).some(tool=>tool.function.name==='get_knowledge_graph'));
 const result=await executePlatformTool({function:{name:'get_knowledge_graph',arguments:'{}'}} as any,{} as any,{actor,database:db,knowledge} as any) as Awaited<ReturnType<typeof readKnowledgeGraph>>;
 assert.equal(result.nodes.length,3);assert.equal(result.edges.length,3);assert.equal(result.truncated,false);assert.equal(result.bindings.length,1);assert.equal(result.bindings[0].targetId,'course');
});
test('supports tags, empty search results, bounded neighbors, truncation and explicit published scope',async()=>{
 const result=await readKnowledgeGraph(knowledge,actor,{query:'研究',depth:0});assert.deepEqual(result.nodes.map(node=>node.id),['a']);
 assert.equal((await readKnowledgeGraph(knowledge,actor,{query:'不存在的机器学习内容'})).nodes.length,0);
 assert.equal((await readKnowledgeGraph(knowledge,actor,{nodeId:'a',depth:1,limit:2})).truncated,true);
 assert.equal((await readKnowledgeGraph(knowledge,actor,{scope:'published'})).nodes.length,4);
 await assert.rejects(()=>readKnowledgeGraph(knowledge,actor,{nodeId:'d'}),/不在当前可查看/);
 for(const args of [{depth:3},{limit:61},{scope:'admin'},{write:true}])await assert.rejects(()=>readKnowledgeGraph(knowledge,actor,args));
});
test('missing service fails clearly instead of inventing graph data',async()=>{
 await assert.rejects(()=>executePlatformTool({function:{name:'get_knowledge_graph',arguments:'{}'}} as any,{} as any,{actor,database:db} as any),/知识图谱服务不可用/);
});
test('real Agent harness exposes graph tool and executes it for a broad learning request',async()=>{
 let rounds=0,reads=0;
 const agents={claimForExecution:async()=>({createdAt:new Date().toISOString(),scenario:'chat',input:{prompt:'我想学习机器学习',parameters:{}}}),appendAgentMessage:async()=>{},appendToolCall:async()=>{},appendArtifact:async()=>{},finishRun:async(_id:any,delivery:any)=>({status:delivery.status})};
 const adapter={id:'scripted',capabilities:['chat'],execute:async(input:any)=>{rounds++;assert.ok(input.parameters.tools.some((tool:any)=>tool.function.name==='get_knowledge_graph'));return rounds===1?{kind:'text',content:'',toolCalls:[{id:'graph',type:'function',function:{name:'get_knowledge_graph',arguments:'{}'}}]}:{kind:'text',content:'当前知识图谱尚无机器学习课程，现有用户观察节点关联用户研究课程。'};}};
 const service={getMap:async(received:any)=>{reads++;assert.equal(received.id,actor.id);return map;}};
 const harness=new AgentHarnessService(agents as any,{getForJob:()=>adapter} as any,{} as any,{} as any,db,{} as any,{} as any,{} as any,{} as any,{} as any,undefined,service as any);
 const result:any=await harness.execute(actor,'run',{mode:'server',searchEnabled:false,context:[],model:{}} as any);
 assert.equal(result.status,'succeeded');assert.equal(reads,1);assert.equal(rounds,2);
});
