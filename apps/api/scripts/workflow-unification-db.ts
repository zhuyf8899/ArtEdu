import { config } from 'dotenv';
import { Client } from 'pg';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { StudioService } from '../src/modules/studio/studio.service';
import { workflowVersionInputSchema } from '../src/modules/studio/studio.contracts';

config({path:'apps/api/.env',quiet:true} as any);
async function main() {
  if (!['localhost','127.0.0.1','[::1]'].includes(new URL(process.env.DATABASE_URL!).hostname)) throw Error('Local DB only');
  const client=new Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:5000});
  await client.connect(); await client.query('BEGIN');
  const checks:string[]=[],calls:any[]=[];
  try {
    const id=`unified-qa-${Date.now()}`,actor:any={id,username:id,displayName:id,roles:['admin'],accountStatus:'active'};
    await client.query('INSERT INTO users(id,username,display_name) VALUES($1,$1,$1)',[id]);
    const db:any={query:(sql:string,values:any[])=>client.query(sql,values),transaction:(fn:any)=>fn(client)};
    let fail=false;
    const service=new StudioService(db,{requireAnyRole:()=>{}} as any,{runJob:async (_:any,input:any)=>{
      calls.push(input);if(fail)throw Error('隔离供应商失败');
      return {job:{id:`job-${calls.length}`},output:{content:input.prompt+' 完成'},artifact:{id:`image-${calls.length}`,downloadUrl:'/fixture.png'}};
    }} as any,{getForJob:()=>({id:'isolated-text-model'})} as any);
    const n=(id:string,type:string,value='',data:any={})=>({id,type,position:{x:0,y:0},data:{label:id,value,...data}});
    const e=(source:string,target:string,targetHandle='input',sourceHandle='output')=>({id:`${source}-${target}-${sourceHandle}-${targetHandle}`,source,target,targetHandle,sourceHandle});
    const workflow=await service.createWorkflow(actor,{name:'统一画布事务验收',description:'全部回滚',category:'测试',entryType:'workbench'});
    const start=async (nodes:any[],edges:any[])=>{
      const version=await service.createWorkflowVersion(actor,workflow.id,workflowVersionInputSchema.parse({definition:{nodes,edges},publish:false}));
      return service.startWorkflow(actor,workflow.id,{context:{},versionId:version.id}) as any;
    };
    const finish=async (run:any)=>{for(let i=0;run.status==='in_progress'&&i<100;i++)run=await service.executeRun(actor,run.id,{});assert.equal(run.status,'completed');return run;};
    let run=await start([n('a','prompt','方案A'),n('b','prompt','方案B'),n('ga','ksampler'),n('gb','ksampler'),n('select','result_select','',{selection:'b'}),n('out','save_image')],[e('a','ga'),e('b','gb'),e('ga','select','a'),e('gb','select','b'),e('select','out')]);
    run=await finish(run);assert.equal(calls.length,1);assert.equal(calls[0].prompt,'方案B');assert.equal(run.context.nodeResults.ga.kind,'skipped');checks.push('result-select-prunes-unused-model-branch');
    const oldArtifact=run.context.artifact.id;
    await assert.rejects(service.rerunNode({...actor,id:'someone-else'},run.id,'gb'));
    let replay:any=await service.rerunNode(actor,run.id,'gb');assert.equal(replay.context.artifact,undefined);assert.equal(replay.context.nodeResults.out,undefined);assert.ok(replay.context.nodeResults.b);
    replay=await finish(replay);assert.equal(calls.length,2);assert.notEqual(replay.context.artifact.id,oldArtifact);checks.push('rerun-owned-snapshot-invalidates-descendants-and-preserves-predecessors');
    await client.query("UPDATE workflow_runs SET context_json=jsonb_set(context_json,'{executing}',jsonb_build_object('at',CURRENT_TIMESTAMP,'token','busy')) WHERE id=$1",[run.id]);
    await assert.rejects(service.rerunNode(actor,run.id,'gb'),/正在执行/);checks.push('rerun-rejects-active-execution-and-other-owner');
    calls.length=0;
    run=await start([n('p','prompt','红色'),n('c','condition','红',{field:'prompt',operator:'contains'}),n('yes','ksampler'),n('no','ksampler'),n('out','preview')],[e('p','c'),e('c','yes','input','true'),e('c','no','input','false'),e('yes','out'),e('no','out')]);
    run=await finish(run);assert.equal(calls.length,1);assert.equal(run.context.nodeResults.no.kind,'skipped');checks.push('dynamic-condition-skips-unmatched-model-and-merges-active-branch');
    fail=true;
    run=await start([n('p','prompt','海报'),n('g','ksampler'),n('success','save_image'),n('recover','text_preview')],[e('p','g'),e('g','success'),e('g','recover','input','error')]);
    run=await finish(run);assert.equal(run.context.nodeResults.success.kind,'skipped');assert.equal(run.context.nodeResults.recover.text,'隔离供应商失败');checks.push('failure-routes-error-and-skips-success-path');fail=false;
    run=await start([n('text','text_constant','开始'),n('loop','loop','{text}-{index}',{iterations:5,operation:'text_template',until:'-2'}),n('out','text_preview')],[e('text','loop'),e('loop','out')]);
    run=await finish(run);assert.equal(run.context.text,'开始-1-2');assert.equal(run.context.nodeResults.loop.iterations,2);checks.push('bounded-loop-persists-iterations-and-stops-early');
    calls.length=0;
    run=await start([n('text','text_constant','开始'),n('loop','loop','改进文字',{iterations:2,operation:'text_generate'}),n('out','text_preview')],[e('text','loop'),e('loop','out')]);
    run=await finish(run);assert.equal(calls.length,2);assert.ok(calls[1].prompt.includes('完成'));checks.push('loop-invokes-text-model-with-previous-iteration-output');
    for(let i=0;i<22;i++)await service.startWorkflow(actor,workflow.id,{context:{},versionId:run.versionId});
    const history=await service.listMyRuns(actor);assert.ok(history.items.length>20);checks.push('history-retains-more-than-twenty-runs');
    await mkdir('outputs/workflow-unification',{recursive:true});
    const report={passed:checks.length,checks,database:'Docker PostgreSQL localhost:5432',model:'isolated stubs; no external model calls',transaction:'rolled back'};
    await writeFile('outputs/workflow-unification/database-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
  } finally {await client.query('ROLLBACK');await client.end();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
