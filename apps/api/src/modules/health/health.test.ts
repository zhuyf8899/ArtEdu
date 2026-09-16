import test from 'node:test';
import assert from 'node:assert/strict';
import { HealthController } from './health.controller';
import { caseUploadPolicy } from '../../common/upload-policy';
test('就绪检查失败返回 503，不将数据库秘密发送给客户端', async () => {
  const controller = new HealthController({query:async()=>{throw new Error('secret-db-address');}} as any,{} as any);
  await assert.rejects(controller.getReadiness(), error => (error as any).getStatus() === 503 && !(error as Error).message.includes('secret'));
});
test('运行面板需管理角色，不返回数据库连接或密钥', async () => {
  const auth = {getActor:async()=>({roles:['student']})};
  const controller = new HealthController({query:async()=>({rows:[{ready:true}]})} as any,auth as any);
  await assert.rejects(controller.getRuntime({} as any), /管理工作台/);
  auth.getActor = async()=>({roles:['admin']});
  const data = await controller.getRuntime({} as any);
  assert.equal(data.database,true); assert.ok(!('databaseUrl' in data));
});
test('视频配置限制拒绝非法和无上限数值', () => {
  const previous = process.env.CASE_VIDEO_MAX_MIB;
  try {
    for (const value of ['0','101','1.5','NaN']) { process.env.CASE_VIDEO_MAX_MIB=value; assert.throws(caseUploadPolicy); }
    process.env.CASE_VIDEO_MAX_MIB='30'; assert.equal(caseUploadPolicy().videoBytes,30*1024*1024);
  } finally { if(previous===undefined) delete process.env.CASE_VIDEO_MAX_MIB; else process.env.CASE_VIDEO_MAX_MIB=previous; }
});
