// Read-only diagnostics: never seed data, reset passwords, or start/stop services.
import { spawnSync } from 'node:child_process';
const web = new URL(process.env.ARTEDU_CHECK_WEB_URL || 'http://localhost:4173');
const api = new URL(process.env.ARTEDU_CHECK_API_URL || 'http://localhost:4000');
for (const url of [web, api]) {
  if (!['localhost','127.0.0.1','[::1]'].includes(url.hostname) || url.username || url.password || !['http:','https:'].includes(url.protocol)) throw new Error('诊断地址必须是无凭据的本机 HTTP(S) URL');
}
let failed = false;
const docker = spawnSync(process.env.ARTEDU_DOCKER_BIN || 'docker', ['info','--format','{{.ServerVersion}}'], { encoding:'utf8', timeout:10000, windowsHide:true });
console.log(`Docker: ${docker.status === 0 ? '正常' : '不可用或未在 PATH 中（也可能使用远程数据库）'}`);
async function probe(name, base, path, json = false) {
  try {
    const r = await fetch(new URL(path,base), { signal:AbortSignal.timeout(10000), redirect:'error' });
    if (!r.ok) throw new Error();
    if (json) { const body = await r.json(); if(body.status !== 'ok' || body.service !== 'artedu-api') throw new Error(); }
    console.log(`${name}: 正常`);
  } catch { failed = true; console.log(`${name}: 未就绪，请检查端口、API 配置及数据库迁移`); }
}
console.log(`前端 ${web.origin} → API ${api.origin}`);
await probe('API 存活',api,'/api/health',true);
await probe('数据库/素材就绪',api,'/api/health/ready',true);
await probe('前端页面',web,'/');
await probe('前端 API 代理',web,'/api/health/ready',true);
console.log('本诊断未修改数据、登录账号或重启进程。');
if (failed) process.exitCode = 1;
