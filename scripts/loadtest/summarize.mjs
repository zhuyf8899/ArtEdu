import {readFile,readdir,writeFile} from 'node:fs/promises';
const root='local-artifacts/loadtest/runs';
const results=[];
for(const label of await readdir(root)){
 try{
 const dir=`${root}/${label}`;
 const env=JSON.parse(await readFile(`${dir}/environment.json`));
 const end=JSON.parse(await readFile(`${dir}/exit.json`));
 const summary=JSON.parse(await readFile(`${dir}/summary.json`));
 const samples=(await readFile(`${dir}/resources.jsonl`,'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse);
 const m=summary.metrics,load=m['http_req_duration{phase:load}'];
 const mem=value=>{const match=/([\d.]+)(MiB|GiB|KiB)/.exec(value||'');return match?Number(match[1])*(match[2]==='GiB'?1024:match[2]==='KiB'?1/1024:1):0};
 const native=samples.flatMap(s=>(Array.isArray(s.processes)?s.processes:[s.processes]).filter(p=>p?.Id===env.apiPid).map(p=>({...p,at:s.at})));
 const cpus=native.slice(1).map((p,i)=>(p.CPU-native[i].CPU)/((Date.parse(p.at)-Date.parse(native[i].at))/1000)*100);
 results.push({label,users:env.users,hold:env.holdSeconds||180,exit:end.code,requests:m.http_reqs.count,rps:m.http_reqs.rate,p95:load?.['p(95)'],steadyP95:m[`http_req_duration{level:${env.users}}`]?.['p(95)'],failure:m['http_req_failed{phase:load}']?.value,business:m.business_errors?.value,apiMiB:Math.max(0,...native.map(p=>p.WorkingSet64/1024**2),...samples.map(s=>mem(s.api?.MemUsage))),apiCPU:Math.max(0,...cpus,...samples.map(s=>parseFloat(s.api?.CPUPerc)||0)),dbMiB:Math.max(...samples.map(s=>mem(s.database?.MemUsage))),dbCPU:Math.max(...samples.map(s=>parseFloat(s.database?.CPUPerc)||0)),healthFailures:samples.filter(s=>s.health!==200).length,dataMB:m.data_received.count/1e6});
 }catch(error){results.push({label,error:error.message})}
}
await writeFile('local-artifacts/loadtest/results.json',JSON.stringify(results,null,2));
console.log(JSON.stringify(results,null,2));
