import test from 'node:test';
import assert from 'node:assert/strict';
import {AtomicService} from './atomic.service';
import {atomicKnowledgeSchema,parseAtomic} from './atomic.contracts';
const actor=(id:string,roles:string[])=>({id,roles}) as any;
function service(kind='teaching',owner='teacher'){
 const db={transaction:async(fn:any)=>fn({query:async(sql:string)=>({rows:sql.startsWith('SELECT * FROM atomic_nodes')?[{id:'atom',owner_id:owner,kind}]:sql.startsWith('SELECT revision')?[{revision:1}]:[],rowCount:1})})};
 const auth={requireAnyRole(a:any,roles:string[]){if(!a.roles.some((r:string)=>roles.includes(r)))throw new Error('forbidden');}};
 return new AtomicService(db as any,auth as any);
}
test('知识点关联拒绝重复 ID 与额外字段',()=>{
 assert.throws(()=>parseAtomic(atomicKnowledgeSchema,{revision:1,knowledgeNodeIds:['a','a']}));
 assert.throws(()=>parseAtomic(atomicKnowledgeSchema,{revision:1,knowledgeNodeIds:[],userId:'other'}));
});
test('学生和非所有者教师不能修改原子能力关联',async()=>{
 await assert.rejects(()=>service('teaching','student').bindKnowledge(actor('student',['student']),'atom',{revision:1,knowledgeNodeIds:[]}));
 await assert.rejects(()=>service().bindKnowledge(actor('other',['teacher']),'atom',{revision:1,knowledgeNodeIds:[]}));
});
test('课程和心得不能冒充教学原子关联，知识点必须存在且发布',async()=>{
 await assert.rejects(()=>service('reflection').bindKnowledge(actor('teacher',['teacher']),'atom',{revision:1,knowledgeNodeIds:[]}));
 await assert.rejects(()=>service().bindKnowledge(actor('teacher',['teacher']),'atom',{revision:1,knowledgeNodeIds:['missing']}));
});
