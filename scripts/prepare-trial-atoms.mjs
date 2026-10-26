// Local content deployment only. Reuses published trial text; never migrates learner progress.
// Run --apply to prepare drafts, add --publish-trial after source verification to publish trial references.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const require=createRequire(new URL('../apps/api/package.json',import.meta.url));
require('dotenv').config({path:fileURLToPath(new URL('../apps/api/.env',import.meta.url)),quiet:true});
const url=new URL(process.env.DATABASE_URL);assert.ok(['localhost','127.0.0.1'].includes(url.hostname),'This command only targets the local development database');
const pool=new (require('pg').Pool)({connectionString:process.env.DATABASE_URL});
const {AtomicService}=require('./dist/modules/atomic/atomic.service.js'),{AuthService}=require('./dist/modules/auth/auth.service.js');
const db={query:(...args)=>pool.query(...args),transaction:async fn=>{const client=await pool.connect();try{await client.query('BEGIN');const value=await fn(client);await client.query('COMMIT');return value;}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}}};
try{
 const users=await pool.query("SELECT u.id,u.display_name,array_agg(r.name) AS roles FROM users u JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id WHERE u.status='active' GROUP BY u.id ORDER BY u.created_at,u.id");
 const teacher=users.rows.find(u=>u.roles.includes('teacher')),admin=users.rows.find(u=>u.roles.includes('admin')&&u.id!==teacher?.id);
 assert.ok(teacher&&admin,'A teacher and a different administrator are required');
 const service=new AtomicService(db,new AuthService(db));
 const source=await pool.query("SELECT l.id,l.title,l.teaching_json FROM course_lessons l JOIN courses c ON c.id=l.course_id WHERE c.status='published' AND l.status='published' AND c.catalog_json->>'availability'='trial' ORDER BY CASE c.catalog_json->>'code' WHEN 'COL-01' THEN 0 WHEN 'TYP-02' THEN 1 WHEN 'GRD-03' THEN 2 ELSE 3 END,l.sort_order");
 console.log(JSON.stringify({mode:process.argv.includes('--apply')?'apply':'plan',lessons:source.rows.map(l=>l.title),publishTrial:process.argv.includes('--publish-trial')}));
 if(!process.argv.includes('--apply'))process.exitCode=0;
 else{
  const prepared=await service.prepareStarterDrafts(teacher);console.log('新增原子草稿：'+prepared.created);
  const sources=await pool.query('SELECT s.node_id,s.lesson_id FROM atomic_starter_sources s WHERE s.owner_id=$1',[teacher.id]);
  const steps=[];
  for(const lesson of source.rows){
   const id=sources.rows.find(s=>s.lesson_id===lesson.id)?.node_id;assert.ok(id,'Missing source association');
   let detail=await service.detail(teacher,id);
   assert.equal(detail.payload.title,lesson.title);
   assert.ok(detail.payload.source.includes(lesson.id)&&detail.payload.content.includes('试学参考内容'));
   for(const section of lesson.teaching_json?.sections||[])assert.ok(detail.payload.content.includes(section.text),'Original teaching text must remain intact');
   if(process.argv.includes('--publish-trial')){
    const visual=lesson.teaching_json?.visual;
    if(['color','type','grid'].includes(visual)&&detail.payload.visual!==visual){
     assert.ok(['draft','published'].includes(detail.status),'Revise only a draft or published version');
     await service.save(teacher,id,{expectedRevision:detail.revision,payload:{...detail.payload,visual}});
     detail=await service.detail(teacher,id);
    }
    if(detail.status==='rejected')throw Error('A rejected version requires an educator to revise it: '+id);
    if(detail.status==='draft'){
     const knowledge=await pool.query("SELECT id FROM knowledge_nodes WHERE status='published' AND title=ANY($1::text[]) ORDER BY id",[detail.payload.knowledge]);
     if(knowledge.rows.length)await service.bindKnowledge(teacher,id,{revision:detail.revision,knowledgeNodeIds:knowledge.rows.map(k=>k.id)});
     await service.submit(teacher,id,detail.revision);
    }
    if(detail.status!=='published')await service.decide(admin,id,{revision:detail.revision,decision:'publish',note:'本地内容整理核对：原文与已公开试学课时一致，来源、任务与版本引用已核对。作为试学参考发布，仍保留待教研说明，不作正式能力认证。'});
    steps.push({atomId:id,revision:detail.revision,required:true,context:'将本原子的知识用于设计表达练习。',task:'',prerequisites:steps.length?[steps.at(-1).atomId]:[]});
   }
  }
  if(steps.length){
   const title='设计表达入门 · 原子学习路线';
   const existing=await pool.query("SELECT n.id FROM atomic_nodes n JOIN atomic_versions v ON v.node_id=n.id WHERE n.owner_id=$1 AND n.kind='course' AND v.payload->>'title'=$2 LIMIT 1",[teacher.id,title]);
   if(!existing.rows.length){const course=await service.create(teacher,{kind:'course',payload:{title,summary:'连接色彩、字体与版式的九个试学原子，先理解，再练习，最后形成自己的设计表达。内容仍为待教研完善的试学参考，各原子练习由教师评价。',steps}});await service.submit(teacher,course.id,1);await service.decide(admin,course.id,{revision:1,decision:'publish',note:'核对九个已发布试学原子、版本引用及先修顺序后发布；不迁移或虚构旧学习记录。'});console.log('完整试学路线已发布：'+course.id);}
   else{
    let course=await service.detail(teacher,existing.rows[0].id);
    if(JSON.stringify(course.payload.steps)!==JSON.stringify(steps)){
     assert.ok(['draft','published'].includes(course.status),'Course is awaiting review');
     const saved=await service.save(teacher,course.id,{expectedRevision:course.revision,payload:{...course.payload,steps}});
     course=await service.detail(teacher,course.id);
     assert.equal(course.revision,saved.revision);
    }
    if(course.status==='draft')await service.submit(teacher,course.id,course.revision);
    if(['draft','pending_review'].includes(course.status))await service.decide(admin,course.id,{revision:course.revision,decision:'publish',note:'核对试学图例及最新已发布原子版本；旧版课程及学习记录保留。'});
    console.log('完整路线当前版本：'+course.id+' V'+course.revision);
   }
   console.log('已核对并公开 '+steps.length+' 个试学原子；没有写入任何学习进度。');
  }
 }
}finally{await pool.end();}
