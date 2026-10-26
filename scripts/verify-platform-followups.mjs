// Real database + service integration; all fixtures, sessions and actions roll back.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const require=createRequire(new URL('../apps/api/package.json',import.meta.url));require('dotenv').config({path:fileURLToPath(new URL('../apps/api/.env',import.meta.url)),quiet:true});
assert.ok(['localhost','127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname));
const pool=new (require('pg').Pool)({connectionString:process.env.DATABASE_URL}),client=await pool.connect();
try{
 await client.query('BEGIN');
 const db={query:(...args)=>client.query(...args),transaction:fn=>fn(client)},actors={};
 for(const role of ['student','teacher','admin','operator']){const id='audit-qa-'+randomUUID();await client.query('INSERT INTO users(id,username,display_name) VALUES($1,$1,$2)',[id,'回滚验证 '+role]);actors[role]={id,roles:[role]};}
 const {AuthService}=require('./dist/modules/auth/auth.service.js'),{AtomicService}=require('./dist/modules/atomic/atomic.service.js'),{LearningService}=require('./dist/modules/learning/learning.service.js'),{ToolRecommendationsService}=require('./dist/modules/studio/tool-recommendations.js');
 const auth=new AuthService(db),atomic=new AtomicService(db,auth),learning=new LearningService(db),tools=new ToolRecommendationsService(db,auth);
 const first=await atomic.prepareStarterDrafts(actors.teacher),second=await atomic.prepareStarterDrafts(actors.teacher);assert.ok(first.created>0);assert.equal(second.created,0);assert.equal(first.items.length,second.items.length);
 const draft=await atomic.detail(actors.teacher,first.items[0].id);assert.ok(draft.payload.content.includes('试学参考内容'));assert.equal(draft.status,'draft');
 await assert.rejects(atomic.prepareStarterDrafts(actors.student),/无权/);
 await atomic.submit(actors.teacher,draft.id,draft.revision);await atomic.decide(actors.admin,draft.id,{revision:draft.revision,decision:'publish',note:'仅用于事务回滚验证'});
 const task=await learning.createTask(actors.student,{title:'原子任务回链',taskType:'atom',targetId:draft.id,targetRevision:1,dueDate:'2026-10-01'});assert.equal(task.targetId,draft.id);assert.equal(task.targetRevision,1);
 const edited=await learning.updateTask(actors.student,task.id,{title:'调整后的原子任务',dueDate:'2026-10-30'});assert.equal(edited.title,'调整后的原子任务');
 await assert.rejects(learning.updateTask(actors.teacher,task.id,{title:'越权修改'}),/不存在/);
 const note=await learning.createNote(actors.student,{title:'原子观察',content:'记录颜色关系和实际配色的观察。'});const next=await learning.updateNote(actors.student,note.id,{content:'修订后加入了对比方法和实践结果。'});assert.ok(next.content.includes('修订后'));
 await assert.rejects(learning.updateNote(actors.teacher,note.id,{content:'越权修改'}),/不存在/);
 const recommendation=await tools.create(actors.student,{title:'测试工具',url:'https://example.org/',reason:'仅用于本地事务回滚测试，不会抓取外站'});
 assert.equal((await tools.list(actors.student)).items[0].status,'pending');assert.equal((await tools.list(actors.teacher)).items.length,0);
 await assert.rejects(tools.list(actors.student,true),/无权/);await assert.rejects(tools.decide(actors.student,recommendation.id,{status:'accepted',feedback:'不能自审核'}),/无权/);
 assert.ok((await tools.list(actors.operator,true)).items.some(t=>t.id===recommendation.id));
 await tools.decide(actors.admin,recommendation.id,{status:'accepted',feedback:'审核已采纳，待管理员整理目录。'});
 assert.equal((await tools.list(actors.student)).items[0].status,'accepted');await assert.rejects(tools.decide(actors.admin,recommendation.id,{status:'rejected',feedback:'重复处理'}),/已处理/);
 const {PortalService}=require('./dist/modules/portal/portal.service.js');const search=new PortalService(db,{});const results=await search.search(actors.student,{type:'atomic',query:draft.payload.title});assert.ok(results.items.some(item=>item.id===draft.id&&item.route.includes('revision=1')));
 console.log('PASS: starter idempotency, draft visibility and approval, atom task links/revision, task edits, note edits and user isolation, tool submit/review/feedback and role checks, public atomic search. All fixtures rolled back.');
}finally{await client.query('ROLLBACK');client.release();await pool.end();}
