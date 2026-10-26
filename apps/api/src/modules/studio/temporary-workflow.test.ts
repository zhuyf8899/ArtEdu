import test from 'node:test';
import assert from 'node:assert/strict';
import {ForbiddenException} from '@nestjs/common';
import {TemporaryWorkflowService,TEMP_WORKFLOW_IDLE_MS} from './temporary-workflow.service';
import {StudioService} from './studio.service';
const actor={id:'owner',roles:['student']} as any,other={id:'other',roles:['admin']} as any;
const node=(id:string,type:string,value='')=>({id,type,position:{x:0,y:0},data:{label:id,value}});
const definition={nodes:[node('text','text_constant','PRIVATE_NODE_TEXT'),node('out','text_preview')],edges:[{id:'edge',source:'text',target:'out'}]};
function fixture(db:any={query:async()=>{throw Error('unexpected SQL');}},generation:any={runJob:async()=>{throw Error('unexpected API call');}}){const studio=new StudioService(db,{} as any,generation);return {studio,service:new TemporaryWorkflowService(db,studio,generation)};}
const settle=()=>new Promise(resolve=>setImmediate(resolve));
test('内存预算同时限制账号与服务；超限不淘汰旧图且不调用模型',async()=>{
 const {service}=fixture();const w=service.create(actor,{name:'保留已有图',definition});
 const entry=(service as any).entries.get(w.id);
 entry.assets.set('large',{bytes:Buffer.alloc(20*1024*1024)});
 assert.throws(()=>service.create(actor,{name:'超限',definition}),/内存额度/);
 assert.equal(service.get(actor,w.id).name,'保留已有图');
 entry.assets.clear();(service as any).reservations.set('other',{ownerId:'other',bytes:128*1024*1024});
 assert.throws(()=>service.create(actor,{name:'服务超限',definition}),/内存额度/);
 assert.equal((service as any).entries.size,1);
 (service as any).reservations.clear();entry.assets.set('large',{bytes:Buffer.alloc(14*1024*1024)});
 let calls=0;(service as any).generation.runJob=async()=>{calls++;};
 const graph={nodes:[node('p','prompt','图片'),node('g','ksampler'),node('o','save_image')],edges:[{id:'a',source:'p',target:'g'},{id:'b',source:'g',target:'o'}]};
 service.edit(actor,w.id,{expectedRevision:1,definition:graph});service.start(actor,w.id,{revision:2,requestId:'quota'});await settle();
 assert.equal(calls,0);assert.match(service.get(actor,w.id).execution!.error!,/内存额度/);
});
test('正式保存期间拒绝重复保存、编辑与执行，完成后解除锁',async()=>{
 const {service,studio}=fixture();const w=service.create(actor,{name:'保存测试',definition});
 let release:any;(studio as any).createWorkflow=()=>new Promise(resolve=>{release=()=>resolve({id:'formal'});});
 (studio as any).createWorkflowVersion=async()=>({id:'version'});
 const pending=service.saveFormal(actor,w.id,1);
 await assert.rejects(service.saveFormal(actor,w.id,1),/版本/);
 assert.throws(()=>service.edit(actor,w.id,{expectedRevision:1,definition}),/版本/);
 assert.throws(()=>service.start(actor,w.id,{revision:1,requestId:'locked'}),/正在执行/);
 release();await pending;assert.equal(service.get(actor,w.id).source?.versionId,'version');
});
test('临时图创建修改不入库；本人限制与乐观版本锁始终生效',()=>{
 const {service}=fixture();const w=service.create(actor,{name:'临时文字图',definition});assert.equal(w.revision,1);
 assert.throws(()=>service.get(other,w.id),ForbiddenException);assert.throws(()=>service.edit(other,w.id,{expectedRevision:1,definition}),ForbiddenException);
 const updated=service.edit(actor,w.id,{expectedRevision:1,definition,changeSummary:'保留正文并整理节点'});assert.equal(updated.revision,2);
 assert.throws(()=>service.edit(actor,w.id,{expectedRevision:1,definition}),/版本/);
 assert.throws(()=>service.create(actor,{name:'原生图',definition:{...definition,engine:'comfyui'}}),/ComfyUI|节点图/);
});
test('读取与轮询不续期；实际编辑续期；过期后从浏览器副本恢复',async context=>{
 let now=1000000;context.mock.method(Date,'now',()=>now);const {service}=fixture();const w=service.create(actor,{name:'清理测试',definition});
 now+=19*60000;service.get(actor,w.id);now+=2*60000;assert.throws(()=>service.get(actor,w.id),/已清理/);
 const restored=await service.restore(actor,w);assert.equal(restored.id,w.id);assert.equal(restored.revision,1);
 now+=19*60000;service.edit(actor,w.id,{expectedRevision:1,definition});now+=2*60000;assert.equal(service.get(actor,w.id).revision,2);
 now+=TEMP_WORKFLOW_IDLE_MS;assert.throws(()=>service.get(actor,w.id),/已清理/);
});
test('只有显式开始才执行，重复请求不重复执行，轮询不改变状态寿命',async()=>{
 let calls=0;const generation={runJob:async(_a:any,input:any,_signal:any,mode:any)=>{calls++;assert.equal(input.prompt,'海报');assert.ok(mode);const artifact=await mode.capture({kind:'asset',content:'memory',mimeType:'image/png',metadata:{bytes:Buffer.from('image-bytes'),fileSize:11,fileName:'result.png'}});return {job:{id:'quota-metadata'},output:{content:'memory'},artifact};}};
 const {service}=fixture(undefined,generation);const graph={nodes:[node('prompt','prompt','海报'),node('image','ksampler'),node('out','save_image')],edges:[{id:'a',source:'prompt',target:'image'},{id:'b',source:'image',target:'out'}]};
 const w=service.create(actor,{name:'API 图片图',definition:graph});assert.equal(calls,0);
 service.start(actor,w.id,{revision:1,requestId:'same-request'});service.start(actor,w.id,{revision:1,requestId:'same-request'});await settle();
 const done=service.get(actor,w.id);assert.equal(done.execution?.status,'completed');assert.equal(calls,1);
 const artifact=done.execution!.artifacts[0];assert.equal(service.asset(actor,w.id,artifact.id).bytes.toString(),'image-bytes');assert.throws(()=>service.asset(other,w.id,artifact.id),ForbiddenException);
});
test('下载续期且二进制与节点图一起清理，内存清空后不保留结果',async context=>{
 let now=1000;context.mock.method(Date,'now',()=>now);const {service}=fixture();const w=service.create(actor,{name:'内存文字图',definition});
 service.start(actor,w.id,{revision:1,requestId:'one'});await settle();assert.equal(service.get(actor,w.id).execution?.text,'PRIVATE_NODE_TEXT');
 const entry=(service as any).entries.get(w.id);entry.assets.set('binary',{id:'binary',bytes:Buffer.from('x'),mimeType:'image/png',fileName:'x.png'});
 now+=19*60000;service.asset(actor,w.id,'binary');now+=2*60000;assert.ok(service.get(actor,w.id));now+=21*60000;service.cleanup();assert.equal((service as any).entries.size,0);
});
test('仅本人最新未发布草稿可载入；Agent 编辑不保存正式版本，用户另存才写入',async()=>{
 let owner='owner',published:any=null,saves=0,version='v1';const db={query:async()=>({rows:[{created_by:owner,status:'draft',published_at:published,version_id:version,definition_json:definition,name:'本人正式草稿'}]})};
 const {service,studio}=fixture(db);(studio as any).createWorkflowVersion=async(_a:any,_id:any,input:any)=>{saves++;assert.equal(input.expectedVersionId,'v1');return {id:'v2'};};
 const w=await service.fromDraft(actor,'formal');service.edit(actor,w.id,{expectedRevision:1,definition});assert.equal(saves,0);await service.saveFormal(actor,w.id,2);assert.equal(saves,1);
 published=new Date();await assert.rejects(service.fromDraft(actor,'formal'),ForbiddenException);published=null;owner='other';await assert.rejects(service.fromDraft(actor,'formal'),ForbiddenException);
});
test('本人不完整草稿可载入修复，但未修复前不能执行；轮询不启动任何 API',async()=>{
 const incomplete={nodes:[node('missing','ksampler'),node('out','preview')],edges:[{id:'a',source:'missing',target:'out'}]};
 const db={query:async()=>({rows:[{created_by:'owner',status:'draft',published_at:null,version_id:'v1',definition_json:incomplete,name:'待修草稿'}]})};
 const {service}=fixture(db);const w=await service.fromDraft(actor,'formal');assert.throws(()=>service.start(actor,w.id,{revision:1,requestId:'one'}),/连接|输入/);assert.equal(service.get(actor,w.id).execution,null);
});
