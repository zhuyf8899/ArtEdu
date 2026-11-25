import test from 'node:test';
import assert from 'node:assert/strict';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { AtomicService } from './atomic.service';
import { atomPayload,coursePayload,atomicListSchema,parseAtomic,createAtomicSchema } from './atomic.contracts';
const teacher={id:'teacher',roles:['teacher']} as any,student={id:'student',roles:['student']} as any;
const valid={title:'色彩对比',summary:'理解色彩的不同对比关系',objective:'能够运用冷暖对比表达情绪',content:'观察两幅图像的色彩关系，解释它们的区别。',minutes:15,knowledge:['色彩对比'],completion:'read'};
const auth={requireAnyRole:(a:any,roles:string[])=>{if(!a.roles.some((r:string)=>roles.includes(r)))throw new ForbiddenException();}} as any;

test('教学原子与课程独立保存教师署名，兼容旧版本并校验长度',()=>{
 const course={title:'设计课程',summary:'从理解走向完整实践',steps:[{atomId:'a',revision:1}]};
 for(const [schema,payload] of [[atomPayload,valid],[coursePayload,course]] as const){
  const parsed=schema.parse({...payload,teacherName:'  张老师、李老师  ',teacherBio:'  设计学院\n视觉传达方向  '});
  assert.equal(parsed.teacherName,'张老师、李老师');
  assert.equal(parsed.teacherBio,'设计学院\n视觉传达方向');
  assert.equal(schema.safeParse(payload).success,true);
  assert.equal(schema.safeParse({...payload,teacherName:'师'.repeat(201)}).success,false);
  assert.equal(schema.safeParse({...payload,teacherBio:'师'.repeat(2001)}).success,false);
  assert.equal(schema.safeParse({...payload,ownerId:'another-teacher'}).success,false);
  assert.equal(schema.parse({...payload,teacherName:'',teacherBio:''}).teacherName,'');
 }
});

test('原子列表分类和学习状态允许组合，拒绝未知字段和伪造状态',()=>{
 const result=atomicListSchema.parse({view:'atoms',direction:'设计方法',stage:'in_progress',page:'2'});
 assert.equal(result.direction,'设计方法');assert.equal(result.stage,'in_progress');assert.equal(result.page,2);
 assert.equal(atomicListSchema.safeParse({direction:'SQL injection'}).success,false);
 assert.equal(atomicListSchema.safeParse({stage:'published'}).success,false);
 assert.equal(atomicListSchema.safeParse({userId:'someone-else'}).success,false);
});
test('非课程节点提交课程任务返回 400，且不读取课程版本或写入提交',async()=>{
 for(const kind of ['teaching','reflection']){
  const calls:string[]=[];
  const db={transaction:async(fn:any)=>fn({query:async(sql:string)=>{
   calls.push(sql);
   return {rows:[sql.includes('atomic_nodes')?{id:'atom',kind,owner_id:'teacher'}:{payload:{completion:'read'}}]};
  }})};
  const service=new AtomicService(db as any,auth);
  await assert.rejects(service.task(student,'atom',{revision:1,atomId:'atom',submission:'这是足够长的课程任务提交说明'}),(error:unknown)=>error instanceof BadRequestException&&error.getStatus()===400);
  assert.equal(calls.length,1);
  assert.ok(calls[0].includes('atomic_nodes'));
 }
});
test('原子必须有独立目标、内容和明确练习，拒绝未知字段',()=>{
 assert.deepEqual(parseAtomic(atomicListSchema,{}),{view:'atoms',query:'',direction:'',stage:'',page:1});
 assert.deepEqual(parseAtomic(atomPayload,valid).assetIds,[]);
 assert.equal(atomPayload.safeParse({...valid,completion:'practice'}).success,false);
 assert.equal(atomPayload.safeParse({...valid,objective:'',isMastered:true}).success,false);
 assert.equal(createAtomicSchema.safeParse({kind:'teacher',payload:valid}).success,false);
});
test('课程拒绝重复引用、循环/反向先修、课程外先修与全选修',()=>{
 const a={atomId:'a',revision:1},b={atomId:'b',revision:1,prerequisites:['a']};
 assert.equal(coursePayload.safeParse({title:'设计课程',summary:'从理解走向完整实践',steps:[a,b]}).success,true);
 for(const steps of [[a,a],[b,a],[{...a,prerequisites:['missing']}],[{...a,required:false}]])assert.equal(coursePayload.safeParse({title:'设计课程',summary:'从理解走向完整实践',steps}).success,false);
});
test('学生不能创建教学原子或课程，审核队列不向学生开放',async()=>{
 const db={query:async()=>{throw Error('must not access database');}};
 const s=new AtomicService(db as any,auth);
 for(const kind of ['teaching','course']as const)await assert.rejects(s.create(student,{kind,payload:valid}),ForbiddenException);
 await assert.rejects(s.list(student,{view:'review',query:'',page:1}),ForbiddenException);
 await assert.rejects(s.list(student,{view:'manage',query:'',page:1}),ForbiddenException);
 await assert.rejects(s.create(student,{kind:'reflection',payload:valid}),/关联原子/);
});
test('教学原子和完整课程直接发布，心得仍进入审核队列',async()=>{
 for(const [kind,actor] of [['teaching',teacher],['course',{id:'admin',roles:['admin']}],['reflection',student]] as const){
  const calls:{sql:string;values:unknown[]}[]=[];
  const payload=kind==='course'?{title:'设计课程',summary:'从理解走向完整实践',steps:[{atomId:'atom',revision:1}]}:valid;
  const db={transaction:async(fn:any)=>fn({query:async(sql:string,values:unknown[])=>{
   calls.push({sql,values});
   if(sql.startsWith('SELECT * FROM atomic_nodes'))return {rows:[{id:'node',kind,owner_id:actor.id}]};
   if(sql.startsWith('SELECT * FROM atomic_versions'))return {rows:[{revision:1,status:'draft',payload}]};
   return {rows:[{kind:'teaching',status:'published'}]};
  }})};
  const service=new AtomicService(db as any,auth);
  assert.deepEqual(await service.submit(actor,'node',1),{status:kind==='reflection'?'pending_review':'published'});
  assert.equal(calls.some(call=>call.sql.includes('SET published_revision')),kind!=='reflection');
  assert.ok(calls.some(call=>call.values.includes(kind==='reflection'?'submit':'direct_publish')));
 }
});
test('编辑/附件检查归属优先，禁止他人草稿上传和自审核',async()=>{
 const node={id:'atom',kind:'teaching',owner_id:'other',published_revision:null};
 const db={query:async()=>({rows:[node]}),transaction:async(fn:any)=>fn({query:async()=>({rows:[node]})})};
 const s=new AtomicService(db as any,auth);
 await assert.rejects(s.save(teacher,'atom',{expectedRevision:1,payload:valid}),ForbiddenException);
 await assert.rejects(s.upload(teacher,'atom',1,{file:async()=>{throw Error('must not read upload');}}as any),ForbiddenException);
 node.owner_id='reviewer';await assert.rejects(s.decide({id:'reviewer',roles:['operator']}as any,'atom',{revision:1,decision:'publish',note:'通过审核'}),/自己/);
});
test('练习不能自行确认完成，未发布原子不能产生进度',async()=>{
 const node={id:'atom',kind:'teaching',owner_id:'teacher'};
 let status='published';const calls:string[]=[];
 const db={transaction:async(fn:any)=>fn({query:async(sql:string)=>{calls.push(sql);return {rows:[sql.includes('atomic_nodes')?node:{revision:1,status,payload:{completion:'practice'}}]};}})};
 const s=new AtomicService(db as any,auth);
 await assert.rejects(s.progress(student,'atom',{revision:1,action:'complete',submission:''}),/不能自行/);
 status='draft';await assert.rejects(s.progress(student,'atom',{revision:1,action:'read',submission:''}),/已发布/);
 assert.ok(!calls.some(sql=>sql.includes('INSERT')));
});
