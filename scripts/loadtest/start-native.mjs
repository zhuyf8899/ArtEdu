import {spawn} from 'node:child_process';
import {mkdir} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
const root=path.resolve(import.meta.dirname,'../..'),runtime=path.join(root,'local-artifacts/loadtest/runtime');
await mkdir(runtime,{recursive:true});
const env={PATH:process.env.PATH,SystemRoot:process.env.SystemRoot,TEMP:process.env.TEMP,TMP:process.env.TMP,
  NODE_ENV:'test',HOST:'127.0.0.1',PORT:'18200',
  DATABASE_URL:'postgresql://loadtest:loadtest_local_only@127.0.0.1:55432/artedu_loadtest',DATABASE_POOL_SIZE:'10',
  CORS_ORIGIN:'http://127.0.0.1:18200',ENABLE_LOCAL_AUTH:'true',ENABLE_FILE_UPLOADS:'false',
  MODEL_EXECUTION_ENABLED:'false',MODEL_PROVIDERS_JSON:'[]',RAG_ENABLED:'false',ARTEDU_LOAD_TEST:'isolated-local',
  UPLOAD_ROOT:path.join(runtime,'uploads')};
console.log(JSON.stringify({mode:'compiled-native-api',cpus:os.cpus().length,memoryGiB:os.totalmem()/1024**3,node:process.version,paidModels:false}));
const child=spawn(process.execPath,['--require',path.join(root,'scripts/loadtest/preload.cjs'),path.join(root,'apps/api/dist/main.js')],{cwd:runtime,env,stdio:'inherit',windowsHide:true});
child.on('exit',code=>process.exit(code || 0));
process.on('SIGINT',()=>child.kill());
process.on('SIGTERM',()=>child.kill());
