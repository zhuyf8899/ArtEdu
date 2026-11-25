import test from 'node:test';
import assert from 'node:assert/strict';
import { ForbiddenException } from '@nestjs/common';
import { AdminService } from './admin.service';
import { contentLifecycleSchema } from './admin.contracts';

const actor = { id:'admin-demo',roles:['admin'] } as any;
function fixture(status='published',owner='teacher-owner') {
  const calls:Array<{sql:string;values:unknown[]}> = [];
  const auth={requireAnyRole:(user:any,roles:readonly string[])=>{if(!user.roles.some((role:string)=>roles.includes(role)))throw new ForbiddenException();}};
  const client={query:async(sql:string,values:unknown[]=[])=>{calls.push({sql,values});return /SELECT id,status/.test(sql)?{rows:status==='missing'?[]:[{id:'item',status,author_id:owner}]}:{rows:[]};}};
  const db={transaction:async(work:any)=>work(client),query:client.query};
  return { service:new AdminService(auth as any,db as any,{} as any),calls };
}
test('生命周期输入必须有明确动作、原因和期望状态，拒绝永久删除',()=>{
  assert.equal(contentLifecycleSchema.safeParse({action:'archive',reason:'过期修订',expectedStatus:'published'}).success,true);
  for(const input of [{action:'delete',reason:'不需要',expectedStatus:'draft'},{action:'archive',reason:' ',expectedStatus:'draft'},{action:'restore',reason:'恢复',expectedStatus:'archived',force:true}])assert.equal(contentLifecycleSchema.safeParse(input).success,false);
});
test('学生不能下架；教师只管理自己的案例，运营不能删除课程',async()=>{
  const {service,calls}=fixture();
  const input={action:'archive',reason:'下架修订',expectedStatus:'published'} as const;
  await assert.rejects(service.changeContentLifecycle({...actor,roles:['student']},'work','item',input),ForbiddenException);
  await assert.rejects(service.changeContentLifecycle({...actor,roles:['operator']},'course','item',input),ForbiddenException);
  assert.equal(calls.length,0);
  await assert.rejects(service.changeContentLifecycle({...actor,roles:['teacher']},'work','item',input),ForbiddenException);
  assert.deepEqual(await service.changeContentLifecycle({id:'teacher-owner',roles:['teacher']} as any,'work','item',input),{id:'item',status:'archived'});
  await assert.rejects(service.changeContentLifecycle(actor,'works;DROP TABLE works','item',input),/内容类型/);
});
test('软删除锁定行、检查并发状态、撤回待审，保留文件/学习/评论并写审计',async()=>{
  const {service,calls}=fixture('pending_review');
  assert.deepEqual(await service.changeContentLifecycle(actor,'course','item',{action:'archive',reason:'内容修订',expectedStatus:'pending_review'}),{id:'item',status:'archived'});
  assert.match(calls[0].sql,/FOR UPDATE/);
  assert.ok(calls.some(call=>/UPDATE course_reviews/.test(call.sql)));
  assert.ok(calls.some(call=>/audit_records/.test(call.sql)&&call.values.includes('archive')));
  assert.ok(!calls.some(call=>/\bDELETE\b|course_enrollments|lesson_progress|work_assets|comments/.test(call.sql)));
  const stale=fixture('published');await assert.rejects(stale.service.changeContentLifecycle(actor,'course','item',{action:'archive',reason:'内容修订',expectedStatus:'draft'}),/状态已改变/);assert.equal(stale.calls.length,1);
});
test('恢复仅允许回收站，恢复至草稿而不是自动发布，未找到返回明确错误',async()=>{
  const {service,calls}=fixture('archived');
  assert.equal((await service.changeContentLifecycle(actor,'work','item',{action:'restore',reason:'重新修订',expectedStatus:'archived'})).status,'draft');
  assert.ok(calls.some(call=>/audit_records/.test(call.sql)&&call.values.includes('restore')));
  await assert.rejects(fixture('approved').service.changeContentLifecycle(actor,'work','item',{action:'restore',reason:'重新修订',expectedStatus:'approved'}),/只能恢复/);
  await assert.rejects(fixture('missing').service.changeContentLifecycle(actor,'work','item',{action:'archive',reason:'下架修订',expectedStatus:'draft'}),/不存在/);
});
