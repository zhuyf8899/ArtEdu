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
