import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createWriteStream} from 'node:fs';
import {appendFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
const root=path.resolve(import.meta.dirname,'../..'),out=path.join(root,'local-artifacts/loadtest');
const execute=promisify(execFile);
const docker=path.join(process.env.LOCALAPPDATA,'Programs/DockerDesktop/resources/bin/docker.exe');
const binary=path.join(out,'../tools/k6/k6-v2.3.0-windows-amd64/k6.exe');
const apiPid=Number(process.env.LOADTEST_API_PID);
const apiContainer=process.env.LOADTEST_API_CONTAINER;
if(apiContainer && apiContainer!=='artedu-loadtest-api-1')throw Error('Only isolated API container allowed');
const users=Number(process.env.TARGET_VUS || 150);
if(![150,300,500,800,1000,1500,2000].includes(users))throw Error('Supported profiles: 150 through 2000 users');
if(!apiContainer&&(!Number.isInteger(apiPid)||apiPid<1))throw Error('Set LOADTEST_API_PID to the isolated API process ID');
await mkdir(out,{recursive:true});
await writeFile(path.join(out,'resources.jsonl'),'');
await writeFile(path.join(out,'environment.json'),JSON.stringify({at:new Date().toISOString(),platform:os.platform(),node:process.version,cpus:os.cpus().length,cpu:os.cpus()[0].model,hostMemoryGiB:os.totalmem()/1024**3,apiPid,apiContainer,profile:process.env.LOADTEST_PROFILE||'uncapped',apiMode:apiContainer?'Linux Node22 API and PostgreSQL with container quotas, no Nginx':'compiled native Windows Node, no Nginx, dedicated Docker PostgreSQL',users,holdSeconds:Number(process.env.HOLD_SECONDS||180),modelExecution:false,rag:false},null,2));
const log=createWriteStream(path.join(out,'load.log'));
const child=spawn(binary,['run','-e',`TARGET_VUS=${users}`,'--summary-export',path.join(out,'summary.json'),'scripts/loadtest/browse.k6.js'],{cwd:root,env:{...process.env,K6_NO_USAGE_REPORT:'true'},windowsHide:true,stdio:['ignore','pipe','pipe']});
child.stdout.pipe(log,{end:false});child.stderr.pipe(log,{end:false});
let done=false,healthFailures=0,samples=0;
child.on('exit',()=>{done=true;});
const exit=new Promise(resolve=>child.on('close',(code,signal)=>resolve({code,signal})));
async function sample(){
  const snapshot={at:new Date().toISOString(),hostFreeMiB:os.freemem()/1024**2};
  try {
    const [stats,processes,apiStats]=await Promise.all([
      execute(docker,['stats','--no-stream','--format','{{json .}}','artedu-loadtest-postgres-1'],{windowsHide:true,timeout:12000}),
      execute('powershell.exe',['-NoProfile','-NonInteractive','-Command',`Get-Process -Id ${apiContainer?child.pid:apiPid+','+child.pid} -ErrorAction SilentlyContinue | Select-Object Id,ProcessName,CPU,WorkingSet64,PrivateMemorySize64 | ConvertTo-Json -Compress`],{windowsHide:true,timeout:12000}),
      apiContainer?execute(docker,['stats','--no-stream','--format','{{json .}}',apiContainer],{windowsHide:true,timeout:12000}):Promise.resolve(null)]);
    snapshot.database=JSON.parse(stats.stdout.trim());if(apiStats)snapshot.api=JSON.parse(apiStats.stdout.trim());snapshot.processes=JSON.parse(processes.stdout.trim());
  } catch(error){snapshot.monitorError=error.message.slice(0,200);}
  try{const response=await fetch('http://127.0.0.1:18200/api/health/ready',{signal:AbortSignal.timeout(5000)});snapshot.health=response.status;if(response.ok)healthFailures=0;else healthFailures++;}catch{snapshot.health=0;healthFailures++;}
  await appendFile(path.join(out,'resources.jsonl'),JSON.stringify(snapshot)+'\n');samples++;
  if(healthFailures>=3||snapshot.hostFreeMiB<1024){console.log('Stopping load: health failures or less than 1GiB host memory available.');child.kill();}
}
const monitor=(async()=>{while(!done){await sample();if(!done)await new Promise(resolve=>setTimeout(resolve,5000));}})();
console.log(`Local load test started (k6 PID ${child.pid}), up to ${users} users. No external model calls.`);
const result=await exit;await monitor;log.end();
await writeFile(path.join(out,'exit.json'),JSON.stringify({...result,samples,finishedAt:new Date().toISOString()},null,2));
console.log(JSON.stringify({...result,samples}));process.exitCode=result.code ?? 1;
