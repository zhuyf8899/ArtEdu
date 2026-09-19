// 原案例环境专用：只恢复已有服务，不新建空库、不写种子、不重置账号。
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const container=process.env.ARTEDU_CASE_CONTAINER;
const uploads=process.env.ARTEDU_CASE_UPLOAD_ROOT;
const docker=process.env.ARTEDU_DOCKER_BIN;
if(!container||!/^artedu-case-[a-z0-9-]+$/.test(container)||!uploads||!path.isAbsolute(uploads)||!existsSync(uploads)||!docker) {
  throw new Error('Set ARTEDU_CASE_CONTAINER, absolute ARTEDU_CASE_UPLOAD_ROOT and ARTEDU_DOCKER_BIN. No data will be initialized.');
}
const children=[];
let stopping=false;
function stop(code=0){if(stopping)return;stopping=true;for(const child of children)child.kill();process.exitCode=code;}
process.on('SIGINT',()=>stop()); process.on('SIGTERM',()=>stop());
function run(file,args,options={}) {
  const result=spawnSync(file,args,{cwd:root,encoding:'utf8',windowsHide:true,timeout:120000,...options});
  // Do not print subprocess errors: configuration errors may contain credentials.
  if(result.status!==0)throw new Error(`Startup command failed: ${path.basename(file)} ${args[0]}; exit=${result.status}`);
  return result.stdout;
}
async function freePort(port){
  await new Promise((resolve,reject)=>{const server=createServer();server.once('error',()=>reject(new Error(`Port ${port} already occupied; no process stopped`)));server.listen(port,'127.0.0.1',()=>server.close(resolve));});
}
async function ready(url){
  for(let attempt=0;attempt<45;attempt++){
    if(stopping)throw new Error('A service exited during startup');
    try{const response=await fetch(url,{signal:AbortSignal.timeout(2000)});const body=await response.json();if(response.ok&&body.service==='artedu-api'&&body.status==='ok')return;}catch{}
    await new Promise(resolve=>setTimeout(resolve,1000));
  }
  throw new Error(`Readiness timeout: ${url}`);
}
function service(args,cwd,env){
  const child=spawn(process.execPath,args,{cwd,env,stdio:'inherit',windowsHide:true});children.push(child);
  child.once('error',()=>{console.error('Service could not start');stop(1);});
  child.once('exit',()=>{if(!stopping){console.error('Service exited; stopping the paired service. Run the launcher again.');stop(1);}});
}
try {
  await freePort(4100);await freePort(4273);
  const info=JSON.parse(run(docker,['inspect',container]))[0];
  const binding=info.HostConfig.PortBindings['5432/tcp'];
  if(!binding?.some(item=>item.HostIp==='127.0.0.1'&&item.HostPort==='55434'))throw new Error('Expected database binding 127.0.0.1:55434');
  const config=Object.fromEntries(info.Config.Env.map(item=>{const split=item.indexOf('=');return [item.slice(0,split),item.slice(split+1)];}));
  if(config.POSTGRES_DB!=='artedu_case_qa'||config.POSTGRES_USER!=='artedu'||!config.POSTGRES_PASSWORD)throw new Error('Unexpected database configuration');
  if(!info.State.Running)run(docker,['start',container]);
  let dbReady=false;
  for(let i=0;i<30;i++){try{run(docker,['exec',container,'pg_isready','-U','artedu','-d','artedu_case_qa']);dbReady=true;break;}catch{await new Promise(resolve=>setTimeout(resolve,1000));}}
  if(!dbReady)throw new Error('Database not ready');
  const api=path.join(root,'apps/api');
  const env={...process.env,DATABASE_URL:`postgresql://artedu:${encodeURIComponent(config.POSTGRES_PASSWORD)}@127.0.0.1:55434/artedu_case_qa`,NODE_ENV:'test',PORT:'4100',HOST:'127.0.0.1',CORS_ORIGIN:'http://localhost:4273,http://127.0.0.1:4273',ENABLE_LOCAL_AUTH:'true',ENABLE_FILE_UPLOADS:'true',UPLOAD_ROOT:uploads,MODEL_EXECUTION_ENABLED:'false',MODEL_PROVIDERS_JSON:'[]',RAG_ENABLED:'false',ARTEDU_ENV_LABEL:'original-cases-4273',ARTEDU_VERSION:run('git',['rev-parse','--short','HEAD']).trim()};
  // 数据迁移必须显式传入 --migrate；普通重启不得隐式改写数据库结构。
  if(process.argv.includes('--migrate')){
    run(process.execPath,['node_modules/tsx/dist/cli.mjs','src/scripts/migrate.ts'],{cwd:api,env});
    console.log('Explicit database migration completed.');
  }
  run(process.execPath,['node_modules/typescript/bin/tsc'],{cwd:api,env});
  service(['dist/main.js'],api,env);
  await ready('http://127.0.0.1:4100/api/health/ready');
  service(['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','4273','--strictPort'],path.join(root,'admin-console'),{...process.env,VITE_API_PROXY_TARGET:'http://127.0.0.1:4100'});
  await ready('http://127.0.0.1:4273/api/health/ready');
  console.log('READY http://localhost:4273 — existing accounts and cases preserved; external models disabled.');
} catch(error){console.error(error.message);stop(1);}
