import test from 'node:test';
import assert from 'node:assert/strict';
import { AtomicService } from './atomic.service';
test('画像仅查询当前用户的教学原子学习证据',async()=>{
 let sql='',params:unknown[]=[];
 const service=new AtomicService({query:async(text:string,values:unknown[])=>{sql=text;params=values;return {rows:[]};}} as any,{} as any);
 assert.deepEqual(await service.portrait({id:'learner-one'} as any),{items:[]});
 assert.deepEqual(params,['learner-one']);
 assert.ok(sql.includes('p.user_id=$1'));assert.ok(sql.includes("n.kind='teaching'"));assert.ok(sql.includes("v.status='published'"));
 assert.ok(sql.includes('v.revision=n.published_revision OR p.user_id=$1'));
 assert.ok(!sql.includes('p.submission'));assert.ok(!sql.includes('v.payload,'));
});
