import test from 'node:test';
import assert from 'node:assert/strict';
import {AgentService} from './agent.service';
test('quota refusal prevents claiming an agent run',async()=>{
 const queries:string[]=[];
 const service=new AgentService({transaction:async(fn:any)=>fn({query:async(sql:string)=>{queries.push(sql);return {rows:[]};}})} as any,{assertAgentQuotaAvailable:async()=>{throw new Error('quota exhausted');}} as any);
 (service as any).getOwnedRun=async()=>({user_id:'u'});
 await assert.rejects(()=>service.claimForExecution({id:'u',roles:[]} as any,'r'),/quota exhausted/);
 assert.equal(queries.length,1);assert.match(queries[0],/pg_advisory_xact_lock/);
});
test('claim preserves cache expiry while enforcing quota in the same transaction',async()=>{
 const calls:string[]=[];const service=new AgentService({transaction:async(fn:any)=>fn({query:async(sql:string)=>{calls.push(sql);return {rows:[{}]};}})} as any,{assertAgentQuotaAvailable:async()=>{calls.push('quota');}} as any);
 (service as any).getOwnedRun=async()=>({user_id:'u'});(service as any).mapRun=()=>({});
 await service.claimForExecution({id:'u',roles:[]} as any,'r');assert.equal(calls[1],'quota');assert.match(calls[2],/20 minutes/);
});
test('Bridge 回传在事务中校验设备、当前租约和有效期，失败时不记录产物',async()=>{
 const queries:{sql:string;values?:unknown[]}[]=[];
 const service=new AgentService({transaction:async(fn:any)=>fn({query:async(sql:string,values:unknown[])=>{
  queries.push({sql,values});return {rows:[]};
 }})} as any,{} as any);
 const lease='baf72dae-b8d1-4bef-8e39-d70f35d871e4';
 await assert.rejects(service.completeFromLocalBridge('owner','other-device','run',lease,'结果','provider','model'),/租约/);
 assert.equal(queries.length,1);
 assert.deepEqual(queries[0].values,['run','owner','other-device',lease]);
 assert.match(queries[0].sql,/bridge_device_id=\$3 AND run.bridge_lease_id=\$4/);
 assert.match(queries[0].sql,/bridge_lease_expires_at>CURRENT_TIMESTAMP/);
 assert.match(queries[0].sql,/FOR UPDATE OF run/);
});
