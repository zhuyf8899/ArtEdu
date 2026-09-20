import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const launcher='scripts/start-case-local.mjs';
function rejected(config) {
  const env={...process.env,ARTEDU_CASE_CONTAINER:'',ARTEDU_CASE_UPLOAD_ROOT:'',ARTEDU_DOCKER_BIN:'',...config};
  const result=spawnSync(process.execPath,[launcher],{env,encoding:'utf8',timeout:10000});
  assert.equal(result.status,1);
  assert.match(result.stderr,/No data will be initialized/);
  assert.doesNotMatch(result.stdout,/READY/);
}
test('案例启动器缺少配置时拒绝启动，不自动初始化',()=>rejected({}));
test('案例启动器拒绝非案例容器及相对素材路径',()=>{
  rejected({ARTEDU_CASE_CONTAINER:'artedu-postgres',ARTEDU_CASE_UPLOAD_ROOT:process.cwd(),ARTEDU_DOCKER_BIN:'unused'});
  rejected({ARTEDU_CASE_CONTAINER:'artedu-case-test',ARTEDU_CASE_UPLOAD_ROOT:'relative',ARTEDU_DOCKER_BIN:'unused'});
});
test('案例启动器保留固定代理、显式迁移和隐藏后台进程保护',()=>{
  const source=readFileSync(launcher,'utf8');
  assert.match(source,/VITE_API_PROXY_TARGET:'http:\/\/127\.0\.0\.1:4100'/);
  assert.match(source,/process\.argv\.includes\('--migrate'\)/);
  assert.ok(source.indexOf('await freePort(4100)')<source.indexOf("run(docker,['inspect'"));
  assert.doesNotMatch(source,/db:seed|generate-test-accounts|Stop-Process/);
  const wrapper=readFileSync('scripts/start-case-local.ps1','utf8');
  assert.match(wrapper,/-WindowStyle Hidden/);
  assert.match(wrapper,/-RedirectStandardOutput/);
});
