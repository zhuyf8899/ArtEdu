import assert from 'node:assert/strict';
import test from 'node:test';
import {recommendationSchema,recommendationDecision,ToolRecommendationsService} from './tool-recommendations';
test('工具推荐只接受无凭据 HTTPS 官网及明确的审核反馈',()=>{
 assert.ok(recommendationSchema.safeParse({title:'Figma',url:'https://figma.com',reason:'用于原型设计练习'}).success);
 for(const url of ['javascript:alert(1)','http://example.com','https://a:b@example.com'])assert.equal(recommendationSchema.safeParse({title:'工具',url,reason:'用于原型设计练习'}).success,false);
 assert.equal(recommendationDecision.safeParse({status:'accepted',feedback:''}).success,false);
 assert.equal(recommendationDecision.safeParse({status:'published',feedback:'不能通过投稿接口发布目录'}).success,false);
});
test('学生无法读取推荐管理队列或处理投稿，管理列表不向个人列表扩大范围',async()=>{
 const calls:any[]=[];const db={query:async(...args:any[])=>{calls.push(args);return {rows:[]};}};
 const auth={requireAnyRole:(actor:any,roles:string[])=>{if(!actor.roles.some((r:string)=>roles.includes(r)))throw Error('无权');}};
 const service=new ToolRecommendationsService(db as any,auth as any),student={id:'s',roles:['student']} as any;
 await assert.rejects(service.list(student,true),/无权/);
 await assert.rejects(service.decide(student,'x',{status:'accepted',feedback:'同意'}),/无权/);
 assert.equal(calls.length,0);await service.list(student);assert.deepEqual(calls[0][1],[false,'s']);
});
