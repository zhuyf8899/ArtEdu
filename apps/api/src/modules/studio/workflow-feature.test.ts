import 'reflect-metadata';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ForbiddenException} from '@nestjs/common';
import {isWorkflowRoute,WorkflowFeatureGuard,workflowToolNames} from './workflow-feature';
import {WorkflowFeatureController} from './workflow-feature.controller';
import {availablePlatformToolDefinitions,executePlatformTool} from '../agent/agent-tools';
import {ComfyService} from './comfy.service';
const database=(enabled:boolean)=>({query:async()=>({rows:[{enabled}]})}) as any;
test('switch covers native/API graphs, temporary graphs, execution and Worker upload; knowledge graph is independent',()=>{
 for(const url of ['/api/comfy/catalog','/api/comfy/artifacts/:id','/api/workflows','/api/admin/workflows/:id','/api/workflow-runs/:id/execute','/api/temporary-workflows/:id','/api/local-bridge/comfy/register','/api/local-bridge/comfy/jobs/:id/artifacts'])assert.equal(isWorkflowRoute(url),true,url);
 for(const url of ['/api/me/knowledge-map','/api/admin/knowledge-nodes','/api/atomic/network','/api/platform/comfyui-feature','/api/admin/comfyui-feature','/api/local-bridge/comfy/claim','/api/local-bridge/comfy/jobs/:id/pulse','/api/local-bridge/comfy/jobs/:id/finish'])assert.equal(isWorkflowRoute(url),false,url);
});
test('disabled feature blocks direct URL, enabled restores it',async()=>{
 const context={switchToHttp:()=>({getRequest:()=>({url:'/api/comfy/catalog'})})} as any;
 await assert.rejects(()=>new WorkflowFeatureGuard(database(false)).canActivate(context),ForbiddenException);
 assert.equal(await new WorkflowFeatureGuard(database(true)).canActivate(context),true);
});
test('Agent workflow tools disappear and stale calls are rejected, image generation and course knowledge remain available',async()=>{
 const tools=await availablePlatformToolDefinitions(database(false));
 assert.ok(!tools.some(tool=>workflowToolNames.has(tool.function.name)));
 assert.ok(tools.some(tool=>tool.function.name==='generate_image'));
 assert.ok(tools.some(tool=>tool.function.name==='search_course_knowledge'));
 for(const name of workflowToolNames)await assert.rejects(()=>executePlatformTool({function:{name,arguments:'{}'}} as any,{} as any,{database:database(false)} as any),ForbiddenException);
 assert.ok((await availablePlatformToolDefinitions(database(true))).some(tool=>tool.function.name==='create_temporary_workflow'));
});
test('disabled Worker cannot claim queued jobs and receives cancellation through pulse',async()=>{
 let calls=0;
 const db={query:async(sql:string)=>{calls++;return sql.startsWith('SELECT enabled')?{rows:[{enabled:false}]}:{rows:[{status:'running'}]};}} as any;
 const service=new ComfyService(db);
 assert.equal(await service.claim({id:'device',user_id:'owner'}),null);assert.equal(calls,1);
 assert.deepEqual(await service.pulse({id:'device',user_id:'owner'},'run'),{cancel:true});
});
test('only admin can toggle and only booleans are accepted',async()=>{
 let writes=0;const db={transaction:async()=>{writes++;}} as any;
 const denied=new WorkflowFeatureController(db,{getActor:async()=>({roles:['teacher']}),requireAnyRole:()=>{throw new ForbiddenException();}} as any);
 await assert.rejects(()=>denied.set({} as any,{enabled:false}),ForbiddenException);
 const allowed=new WorkflowFeatureController(db,{getActor:async()=>({id:'admin'}),requireAnyRole:()=>{}} as any);
 await assert.rejects(()=>allowed.set({} as any,{enabled:'false'}));assert.equal(writes,0);
});
