// Real HTTP, database and configured model providers. No fixture interception.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
assert.ok(process.argv.includes('--live'),'Use --live to authorize real configured model calls');
const origin=process.env.ARTEDU_TEST_ORIGIN || 'http://127.0.0.1:4000';
assert.ok(['127.0.0.1','localhost'].includes(new URL(origin).hostname));
const out=path.resolve(process.argv.find(a=>a.startsWith('--output='))?.slice(9) || 'outputs/workflow-live-20261025');await mkdir(out,{recursive:true});
const report={startedAt:new Date().toISOString(),mode:'real HTTP + PostgreSQL + configured external model providers',checks:[],workflows:[],runs:[],errors:[],gpu:{status:'not_checked'}};
let cookie='',otherCookie='';
async function request(route,{body,method,auth=cookie,expected,form}={}){
 const response=await fetch(origin+route,{method:method || (body!==undefined||form?'POST':'GET'),headers:{origin:'http://localhost:4173',...(auth?{cookie:auth}:{}),...(body!==undefined?{'content-type':'application/json'}:{})},body:form || (body!==undefined?JSON.stringify(body):undefined),signal:AbortSignal.timeout(240000)});
 if(expected!==undefined)assert.equal(response.status,expected,route);
 return response;
}
async function json(route,options){const response=await request(route,options);const body=await response.json();if(!response.ok)throw Error(`${route}: HTTP ${response.status}; ${body.message || 'request failed'}`);return body;}
async function login(role){const response=await request('/api/auth/login',{auth:'',body:{username:process.env[`ARTEDU_TEST_${role.toUpperCase()}_USERNAME`] || `${role}.demo`,password:process.env[`ARTEDU_TEST_${role.toUpperCase()}_PASSWORD`] || '123456'},expected:201});await response.json();return response.headers.getSetCookie().map(h=>h.split(';')[0]).join('; ');}
const n=(id,type,value='',data={})=>({id,type,position:{x:0,y:0},data:{label:id,value,...data}});
const e=(source,target,sourceHandle='output',targetHandle='input')=>({id:`${source}-${target}-${sourceHandle}`,source,target,sourceHandle,targetHandle});
const check=(name,details={})=>{report.checks.push({name,status:'passed',...details});console.log(JSON.stringify({stage:name,status:'passed',...details}));};
async function start(name,nodes,edges){
 const workflow=await json('/api/workflows',{body:{name:`真实验收-${name}-${Date.now()}`,description:'真实模型与工作流接口验收；仅草稿，不发布',category:'验收',entryType:'workbench'}});report.workflows.push(workflow.id);
 const version=await json(`/api/workflows/${workflow.id}/versions`,{body:{definition:{schemaVersion:2,nodes,edges,groups:[]},publish:false}});
 const run=await json(`/api/workflows/${workflow.id}/runs`,{body:{versionId:version.id,context:{}}});report.runs.push(run.id);assert.equal(run.versionId,version.id);assert.equal(run.trialRun,true);return run;
}
async function finish(run){let steps=0;while(run.status==='in_progress'&&steps++<100){console.log(JSON.stringify({stage:'execute',node:run.steps[run.currentStep]?.id}));run=await json(`/api/workflow-runs/${run.id}/execute`,{body:{}});}assert.equal(run.status,'completed');return run;}
try{
 await json('/api/health/ready');cookie=await login('admin');otherCookie=await login('operator');check('api-database-auth-ready');
 if(process.argv.includes('--api-only')) report.gpu={status:'not_in_scope'};
 else {const catalog=await json('/api/comfy/catalog');report.gpu={status:catalog.workers?.length?'worker_online':'blocked_no_paired_online_worker',workers:catalog.workers?.length || 0,nodeTypes:Object.keys(catalog.nodes || {}).length};console.log(JSON.stringify({stage:'gpu',...report.gpu}));}
 let run=await start('条件生图',[n('需求','prompt','A single blue flower on cream paper, watercolor illustration, no text.'),n('条件','condition','blue',{field:'prompt',operator:'contains'}),n('所选生图','ksampler'),n('未选生图','ksampler'),n('预览','preview'),n('保存','save_image')],[e('需求','条件'),e('条件','所选生图','true'),e('条件','未选生图','false'),e('所选生图','预览'),e('未选生图','预览'),e('预览','保存')]);
 run=await finish(run);assert.equal(run.context.nodeResults.未选生图.kind,'skipped');assert.equal(run.context.nodeResults.所选生图.kind,'generation');
 const artifact=run.context.artifact;assert.ok(artifact?.downloadUrl);const jobId=run.context.nodeResults.所选生图.jobId;const job=await json(`/api/generation-jobs/${jobId}`);assert.equal(job.status,'succeeded');
 check('real-image-conditional-branch',{runId:run.id,jobId,unselectedBranch:'skipped'});
 const downloaded=await request(artifact.downloadUrl,{expected:200});const bytes=Buffer.from(await downloaded.arrayBuffer());assert.equal(bytes.length,artifact.fileSize);assert.ok(bytes.length>1024);assert.match(downloaded.headers.get('content-type'),/^image\//);assert.match(downloaded.headers.get('cache-control'),/no-store/);
 await request(artifact.downloadUrl,{auth:'',expected:401});await request(artifact.downloadUrl,{auth:otherCookie,expected:403});
 const ext=artifact.mimeType==='image/jpeg'?'jpg':artifact.mimeType==='image/webp'?'webp':'png';await writeFile(path.join(out,`generated.${ext}`),bytes);
 report.artifact={...artifact,localPath:path.join(out,`generated.${ext}`),sha256:createHash('sha256').update(bytes).digest('hex')};check('real-image-private-download',{bytes:bytes.length,mimeType:artifact.mimeType});
 let replay=await json(`/api/workflow-runs/${run.id}/nodes/${encodeURIComponent('保存')}/rerun`,{body:{}});assert.equal(replay.context.nodeResults.保存,undefined);assert.equal(replay.context.artifact,undefined);replay=await finish(replay);assert.equal(replay.context.nodeResults.所选生图.jobId,jobId);assert.equal(replay.context.artifact.id,artifact.id);check('rerun-output-reuses-upstream-image-without-new-generation');
 let loop=await start('真实文字循环',[n('起点','text_constant','开始'),n('循环','loop','在给定文字后加一个“好”字，仅返回修改后的文字，不要解释。',{iterations:2,operation:'text_generate'}),n('文字预览','text_preview')],[e('起点','循环'),e('循环','文字预览')]);
 loop=await finish(loop);assert.equal(loop.context.nodeResults.循环.iterations,2);assert.equal(loop.context.nodeResults.循环.outputs.length,2);assert.ok(loop.context.nodeResults.循环.outputs.every(t=>typeof t==='string'&&t.trim()));report.loop={runId:loop.id,outputs:loop.context.nodeResults.循环.outputs};check('real-text-model-loop-two-iterations',{runId:loop.id});
 let recovery=await start('失败恢复',[n('图片输入','load_image'),n('正常预览','preview'),n('错误预览','text_preview')],[e('图片输入','正常预览'),e('图片输入','错误预览','error')]);
 recovery=await finish(recovery);assert.equal(recovery.context.nodeResults.图片输入.kind,'failed');assert.equal(recovery.context.nodeResults.正常预览.kind,'skipped');assert.ok(recovery.context.nodeResults.错误预览.text);check('real-http-failure-routes-error-and-skips-normal-path');
 const form=new FormData();form.append('file',new File([bytes],`recovery.${ext}`,{type:artifact.mimeType}));const upload=await json('/api/creation-files',{form});
 recovery=await json(`/api/workflow-runs/${recovery.id}/nodes/${encodeURIComponent('图片输入')}/rerun`,{body:{}});recovery=await json(`/api/workflow-runs/${recovery.id}/execute`,{body:{referenceFileId:upload.id}});recovery=await finish(recovery);
 assert.equal(recovery.context.nodeResults.图片输入.kind,'reference');assert.equal(recovery.context.nodeResults.正常预览.kind,'preview');assert.equal(recovery.context.nodeResults.错误预览.kind,'skipped');check('real-upload-rerun-recovers-failed-input-and-invalidates-error-branch');
 const history=await json('/api/me/workflow-runs');assert.ok(report.runs.every(id=>history.items.some(r=>r.id===id)));check('real-runs-persist-in-history');
 report.status=process.argv.includes('--api-only')?'passed':'passed_except_gpu_environment';
}catch(error){report.status='failed';report.errors.push(String(error.message));console.error(JSON.stringify({status:'failed',message:error.message}));process.exitCode=1;}
finally{
 report.finishedAt=new Date().toISOString();await writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));
 for(const auth of [cookie,otherCookie].filter(Boolean))await request('/api/auth/logout',{auth,body:{}}).catch(()=>{});
 console.log(JSON.stringify({status:report.status,passed:report.checks.length,gpu:report.gpu,report:path.join(out,'report.json')}));
}
