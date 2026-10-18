import {config} from 'dotenv';import path from 'node:path';import fs from 'node:fs';import assert from 'node:assert/strict';import {Client} from 'pg';import {CloudCacheService} from '../src/modules/cloud-cache/cloud-cache.service';
config({path:path.resolve('apps/api/.env')});
async function main(){
 if(!['localhost','127.0.0.1'].includes(new URL(process.env.DATABASE_URL!).hostname))throw Error('Only localhost allowed');
 process.env.UPLOAD_ROOT=path.resolve('local-artifacts/cloud-cache-isolated-db');fs.mkdirSync(process.env.UPLOAD_ROOT,{recursive:true});
 const client=new Client({connectionString:process.env.DATABASE_URL});await client.connect();await client.query('BEGIN');
 try{
 const id='cache-ttl-'+Date.now();await client.query("INSERT INTO users(id,username,display_name) VALUES($1,$1,'TTL测试')",[id]);
 const db={query:(sql:string,params?:unknown[])=>client.query(sql,params)};
 for(const age of [19,21]){const run=id+'-'+age;await client.query("INSERT INTO agent_runs(id,user_id,scenario,input_json,created_at) VALUES($1,$2,'chat',$3::jsonb,CURRENT_TIMESTAMP-($4*INTERVAL '1 minute'))",[run,id,JSON.stringify({prompt:'隐私测试'}),age]);await client.query("INSERT INTO agent_run_messages(id,run_id,role,content)VALUES($1,$2,'user','隐私测试')",[run+'-msg',run]);}
 const service=new CloudCacheService(db as any);const errors:string[]=[];
 // Real SQL in a rollback transaction, restricted to test actor. No production rows touched.
 const scoped={query:async(sql:string,params?:unknown[])=>{
  if(sql.startsWith('DELETE FROM agent_runs'))return client.query(sql.replace('ORDER BY created_at LIMIT 500',`AND user_id='${id}' ORDER BY created_at LIMIT 500`),params);
  if(sql.startsWith('SELECT o.storage_key'))return client.query(sql,params);
  return client.query(sql.replace('WHERE created_at<=',`WHERE user_id='${id}' AND created_at<=`),params);
 }};
 // Other tables may lack user_id: only execute actual tested cleanup statements for agent and generation; exercise remaining SQL in savepoint rollback below.
 (service as any).db={query:async(sql:string,params?:unknown[])=>{
  if(sql.startsWith('DELETE FROM agent_runs')||sql.startsWith('SELECT o.storage_key'))return scoped.query(sql,params);
  await client.query('SAVEPOINT cache_statement');try{const r=await client.query(sql,params);await client.query('ROLLBACK TO SAVEPOINT cache_statement');return r;}catch(e){errors.push((e as Error).message);await client.query('ROLLBACK TO SAVEPOINT cache_statement');throw e;}finally{await client.query('RELEASE SAVEPOINT cache_statement');}
 }};
 await service.cleanup();assert.deepEqual(errors,[]);const remain=await client.query('SELECT id FROM agent_runs WHERE user_id=$1',[id]);assert.deepEqual(remain.rows.map(r=>r.id),[id+'-19']);const messages=await client.query('SELECT id FROM agent_run_messages WHERE run_id=$1',[id+'-21']);assert.equal(messages.rows.length,0);
 const user=await client.query('SELECT id FROM users WHERE id=$1',[id]);assert.equal(user.rows.length,1);
 fs.writeFileSync('local-artifacts/agent-workspace-20261018/cloud-cache-db-results.json',JSON.stringify({checks:['19分钟保留','21分钟删除','消息级联删除','账号保留','所有清理SQL真实执行后回滚'],passed:true,transaction:'rolled back'},null,2));console.log('数据库TTL回归通过；全部回滚');
 }finally{await client.query('ROLLBACK');await client.end();}
}main().catch(e=>{console.error(e.message);process.exitCode=1;});
