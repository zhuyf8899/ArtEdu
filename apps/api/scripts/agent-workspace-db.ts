import {config} from 'dotenv';import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {Client} from 'pg';
import {AgentService} from '../src/modules/agent/agent.service';import type {DatabaseService} from '../src/modules/database/database.service';import type {Actor} from '../src/modules/auth/auth.service';
config({path:path.resolve('apps/api/.env')});
async function main(){
 const host=new URL(process.env.DATABASE_URL!).hostname;if(!['localhost','127.0.0.1','[::1]'].includes(host))throw Error('Only local database is allowed');
 process.env.UPLOAD_ROOT=path.resolve('local-artifacts/agent-workspace-20261018/db-artifacts');
 const client=new Client({connectionString:process.env.DATABASE_URL}),checks:string[]=[];
 await client.connect();await client.query('BEGIN');
 try{
  const id='agent-local-regression-'+Date.now();await client.query("INSERT INTO users(id,username,display_name) VALUES($1,$1,'Agent隔离回归')",[id]);
  const actor:Actor={id,username:id,displayName:'Agent隔离回归',accountStatus:'active',roles:['student']};
  const database={query:(sql:string,params?:unknown[])=>client.query(sql,params),transaction:async(fn:any)=>fn(client)} as unknown as DatabaseService;
  const service=new AgentService(database);
  for(const status of ['succeeded','partial','paused','needs_confirmation','failed'] as const){
   const created=await service.createRun(actor,{scenario:'chat',prompt:'隔离状态回归',parameters:{}});await service.claimForExecution(actor,created.id);
   const delivery={status,reason:'隔离状态检查',artifacts:[],missing:[],checks:[],budgetExhausted:false};const completed=await service.finishRun(created.id,delivery);
   assert.equal(completed.status,status);assert.deepEqual(completed.delivery,delivery);assert.ok(completed.completedAt);checks.push('persist-'+status);
   await assert.rejects(service.getRun({...actor,id:'another-user'},created.id),/无权/);checks.push('ownership-'+status);
  }
  const active=await service.createRun(actor,{scenario:'chat',prompt:'创建网页',parameters:{}});await service.claimForExecution(actor,active.id);
  await service.appendToolCall(active.id,'write_workspace_file',{},{path:'index.html',openUrl:'/api/agent-runs/workspace-preview/index.html',status:'succeeded'});
  const snapshot=await service.getRun(actor,active.id);assert.equal(snapshot.status,'running');assert.equal(snapshot.delivery?.status,'partial');assert.equal(snapshot.delivery?.artifacts[0].path,'index.html');checks.push('running-checkpoint-retains-files');
  await service.appendToolCall(active.id,'check_page',{},{status:'succeeded',verdict:'fail'});const failed=await service.getRun(actor,active.id);assert.equal(failed.toolCalls.at(-1)?.status,'failed');checks.push('validation-failure-audit-status');
  fs.writeFileSync(path.resolve('local-artifacts/agent-workspace-20261018/db-results.json'),JSON.stringify({database:'localhost',migration:'0038_agent_delivery_states.sql',tests:checks.length,passed:checks.length,checks,transaction:'rolled back; no test rows retained'},null,2));console.log(JSON.stringify({tests:checks.length,passed:checks.length}));
 }finally{await client.query('ROLLBACK');await client.end();}
}
main().catch(e=>{console.error(e.message);process.exitCode=1});
