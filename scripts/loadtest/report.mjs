import {readFile,writeFile} from 'node:fs/promises';
const dir='local-artifacts/loadtest';
const summary=JSON.parse(await readFile(`${dir}/summary.json`,'utf8'));
const env=JSON.parse(await readFile(`${dir}/environment.json`,'utf8'));
const exit=JSON.parse(await readFile(`${dir}/exit.json`,'utf8'));
const samples=(await readFile(`${dir}/resources.jsonl`,'utf8')).trim().split('\n').filter(Boolean).map(line=>JSON.parse(line));
const metrics=summary.metrics;
const format=value=>Number.isFinite(value)?value.toFixed(2):'未记录';
const api=samples.flatMap(sample=>(Array.isArray(sample.processes)?sample.processes:[sample.processes]).filter(item=>item?.Id===env.apiPid).map(item=>({...item,at:sample.at})));
const peakMiB=Math.max(...api.map(item=>item.WorkingSet64/1024**2));
const cpu=[];
for(let i=1;i<api.length;i++) {const seconds=(Date.parse(api[i].at)-Date.parse(api[i-1].at))/1000;if(seconds>0)cpu.push((api[i].CPU-api[i-1].CPU)/seconds*100);}
const dbMem=samples.flatMap(sample=>{const match=/([\d.]+)(MiB|GiB|KiB)/.exec(sample.database?.MemUsage||'');return match?[Number(match[1])*(match[2]==='GiB'?1024:match[2]==='KiB'?1/1024:1)]:[];});
const duration=metrics['http_req_duration{phase:load}']||metrics.http_req_duration;
const failure=metrics['http_req_failed{phase:load}']||metrics.http_req_failed;
const text=`# 本地首轮接口压测结果\n\n采集环境：${env.cpu}，${env.cpus}逻辑CPU，宿主内存${format(env.hostMemoryGiB)}GiB。${env.apiMode}。\n\nk6退出码：${exit.code}；采样${samples.length}次。默认池大小10，数据为独立演示库与150个测试账号。\n\n| 指标 | 结果 |\n| --- | --- |\n| 总HTTP请求（含登录setup） | ${metrics.http_reqs?.count} |\n| 全程平均请求速率（含setup及爬坡） | ${format(metrics.http_reqs?.rate)}次/秒 |\n| 业务请求P95 | ${format(duration?.['p(95)'])}ms |\n| 100用户保持段P95 | ${format(metrics['http_req_duration{level:100}']?.['p(95)'])}ms |\n| 150用户保持段P95 | ${format(metrics['http_req_duration{level:150}']?.['p(95)'])}ms |\n| HTTP失败率 | ${format(failure?.value*100)}% |\n| 业务断言失败率 | ${format(metrics.business_errors?.value*100)}% |\n| API采样RSS峰值 | ${format(peakMiB)}MiB |\n| API采样CPU峰值（单逻辑核=100%） | ${format(Math.max(...cpu))}% |\n| 数据库容器采样内存峰值 | ${format(Math.max(...dbMem))}MiB |\n| 宿主采样最低可用内存 | ${format(Math.min(...samples.map(sample=>sample.hostFreeMiB)))}MiB |\n| 健康检查非200次数 | ${samples.filter(sample=>sample.health!==200).length} |\n\n这是一轮有思考停顿的虚拟用户阶梯测试，不是150个同时在途请求，也不是浏览器渲染测试。100与150用户各保持90秒。未包含媒体下载、RAG、真实模型、GPU、文档导出、Nginx和公网带宽；小规模演示库不同于实际数据规模。不能据此承诺云服务器同等并发容量。\n`;
let report=text.replace('150个测试账号',`${env.users}个测试账号`).replace('不是150个同时在途请求',`不是${env.users}个同时在途请求`);
if(env.users===300){
  report=report.replace(/\| 100用户保持段P95[^\n]*\n\| 150用户保持段P95[^\n]*/,`| 300用户保持段P95 | ${format(metrics['http_req_duration{level:300}']?.['p(95)'])}ms |`)
    .replace('100与150用户各保持90秒。','30秒升压，300用户保持180秒，再用20秒降压。合成目录为15门课程、14个案例，未复制真实媒体文件。');
}
await writeFile(`${dir}/report.md`,report);
console.log(report);
