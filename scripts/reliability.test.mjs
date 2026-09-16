import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const bash = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash';
test('部署和备份脚本 Bash 语法检查', () => {
  for (const file of ['deploy/deploy-staging.sh','deploy/backup-staging.sh','deploy/verify-backup.sh']) {
    const result = spawnSync(bash,['-n',file],{encoding:'utf8'});
    assert.equal(result.status,0,result.stderr);
  }
});
test('部署健康检查失败必须退出；备份位于迁移之前', async () => {
  const code = await readFile('deploy/deploy-staging.sh','utf8');
  assert.ok(code.indexOf('bash deploy/backup-staging.sh') < code.indexOf('$COMPOSE run --rm api npm run db:migrate'));
  assert.match(code,/健康检查未通过[^]*?exit 1[^]*?DEPLOY_DONE/);
  const start = await readFile('scripts/start-local.ps1','utf8');
  assert.match(start,/if \(\$SeedDemo\)/);
  const nginx = await readFile('deploy/nginx.conf','utf8');
  assert.match(nginx,/client_max_body_size 101m/); assert.match(nginx,/client_max_body_size 11m/);
});
test('备份失败不标记完成且恢复原来运行的服务；已有备份拒绝覆盖', async () => {
  const temp = await mkdtemp(path.join(tmpdir(),'artedu-backup-test-'));
  const script = path.join(temp,'mock.sh');
  try {
    await writeFile(script, `#!/usr/bin/env bash\nset -e\ndocker() {\n  case "$*" in\n    *'ps --status running --services'*) printf 'api\\nweb\\n';;\n    *'exec -T postgres pg_dump'*) return 7;;\n    *'start api web'*) echo RESUMED;;\n  esac\n}\nexport -f docker\nbash deploy/backup-staging.sh "$(cd "${temp.replaceAll('\\','/')}" && pwd)/backup"\n`);
    const result = spawnSync(bash,[script.replaceAll('\\','/')],{encoding:'utf8',timeout:10000});
    assert.equal(result.status,7,result.stderr); assert.match(result.stdout,/RESUMED/);
    assert.equal(existsSync(path.join(temp,'backup','COMPLETE')),false);
    const again = spawnSync(bash,[script.replaceAll('\\','/')],{encoding:'utf8',timeout:10000});
    assert.equal(again.status,1); assert.match(again.stderr,/never overwritten/);
  } finally { await rm(temp,{recursive:true,force:true}); }
});
