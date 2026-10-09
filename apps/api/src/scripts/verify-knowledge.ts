import 'dotenv/config';
import 'reflect-metadata';
import assert from 'node:assert/strict';
import {Pool} from 'pg';
import {KnowledgeService} from '../modules/knowledge/knowledge.service';
import {AuthService,type Actor} from '../modules/auth/auth.service';
import type {DatabaseService} from '../modules/database/database.service';
import {learningPathInputSchema} from '../modules/knowledge/knowledge.contracts';
async function main(){
 const url=new URL(process.env.DATABASE_URL!);assert.ok(['localhost','127.0.0.1','[::1]'].includes(url.hostname),'验证脚本仅允许本地数据库');
 const pool=new Pool({connectionString:url.href,connectionTimeoutMillis:5000});const client=await pool.connect();
 await client.query('BEGIN');
 let queryChain:Promise<unknown>=Promise.resolve();
 const serialQuery=(sql:string,args:unknown[]=[])=>{const result=queryChain.then(()=>client.query(sql,args));queryChain=result.catch(()=>undefined);return result;};
 const db={query:serialQuery,transaction:async(work:any)=>{await client.query('SAVEPOINT knowledge_verify');try{const value=await work(client);await client.query('RELEASE SAVEPOINT knowledge_verify');return value;}catch(e){await client.query('ROLLBACK TO SAVEPOINT knowledge_verify');throw e;}}} as unknown as DatabaseService;
 const service=new KnowledgeService(db,new AuthService(db));
 const user='verify-knowledge-'+Date.now(),teacher={id:user,roles:['admin']} as Actor,student={id:user,roles:['student']} as Actor;
 const course=user+'-course',lesson=user+'-lesson',lesson2=user+'-lesson2';
 let checks=0;const check=(name:string)=>{checks++;console.log('PASS '+name);};
 try{
 await client.query('INSERT INTO users(id,username,display_name) VALUES($1,$1,$1)',[user]);
 await assert.rejects(service.getManagedMap(student),/权限|无权|角色/);check('学生不能维护知识库');
 await client.query("INSERT INTO courses(id,slug,title,status,knowledge_points) VALUES($1,$1,'验证课程','published',$2::jsonb)",[course,JSON.stringify([user+'-coverage'])]);
 await client.query("INSERT INTO course_lessons(id,course_id,title,status,knowledge_points) VALUES($1,$2,'验证课时','published',$3::jsonb),($4,$2,'验证课时二','published',$3::jsonb)",[lesson,course,JSON.stringify([user+'-point']),lesson2]);
 let map=await service.getMap(student);let point=map.nodes.find(n=>n.title===user+'-point')!;assert.ok(point);assert.equal(point.progressPercent,0);assert.ok(map.bindings.some(b=>b.nodeId===point.id && b.href==='/learning?course='+course+'&lesson='+lesson));check('标签自动建库，资源返回真实课程和课时地址');
 await client.query("INSERT INTO course_enrollments(id,user_id,course_id) VALUES($1,$2,$3)",[user+'-enrollment',user,course]);
 await client.query("INSERT INTO learning_progress(user_id,lesson_id,status,progress_percent) VALUES($1,$2,'completed',100)",[user,lesson]);
 map=await service.getMap(student);assert.equal(map.nodes.find(n=>n.id===point.id)?.progressPercent,50);assert.equal(map.nodes.find(n=>n.title===user+'-coverage')?.progressPercent,0);check('一个课时完成不代表多个课时全完成；课程标签只表示覆盖');
 await client.query("UPDATE course_enrollments SET status='withdrawn' WHERE user_id=$1",[user]);assert.equal((await service.getMap(student)).nodes.find(n=>n.id===point.id)?.progressPercent,0);check('退出课程后的记录不增加知识进度');
 await client.query("UPDATE course_enrollments SET status='in_progress' WHERE user_id=$1",[user]);
 const a=await service.createNode(teacher,{title:'验证前置',description:'',domain:'verify',sortOrder:0,status:'published'}),b=await service.createNode(teacher,{title:'验证后续',description:'',domain:'verify',sortOrder:1,status:'published'});
 await service.setLinks(teacher,a.id,{edges:[{toNodeId:b.id,relation:'prerequisite'}],bindings:[{targetType:'course',targetId:course}],goalIds:[]});
 await service.setLinks(teacher,b.id,{edges:[],bindings:[{targetType:'lesson',targetId:lesson}],goalIds:[]});
 await assert.rejects(service.setLinks(teacher,b.id,{edges:[{toNodeId:a.id,relation:'prerequisite'}],bindings:[],goalIds:[]}),/形成环/);check('循环前置关系回滚，原关联保留');
 await assert.rejects(service.savePath(student,{title:'无效路径',nodeIds:[b.id]}),/前置/);
 await service.savePath(student,{title:'验证路径',nodeIds:[a.id,b.id]});assert.deepEqual((await service.getMap(student)).path.nodeIds,[a.id,b.id]);assert.deepEqual((await service.getMap({id:user+'-absent'} as Actor)).path.nodeIds,[]);check('路径顺序校验、持久化及账号隔离');
 assert.equal(learningPathInputSchema.safeParse({title:'重复',nodeIds:[a.id,a.id]}).success,false);check('重复节点输入被拒绝');
 await client.query("INSERT INTO workflows(id,name,status) VALUES($1,'验证工作流','published')",[user+'-flow']);
 await client.query("INSERT INTO workflow_versions(id,workflow_id,version_number,definition_json,published_at) VALUES($1,$2,1,$3::jsonb,CURRENT_TIMESTAMP)",[user+'-v1',user+'-flow',JSON.stringify({nodes:[],learning:{knowledgePoints:[user+'-flowpoint']}})]);
 await client.query("INSERT INTO workflow_runs(id,user_id,workflow_id,workflow_version_id,status,total_steps) VALUES($1,$2,$3,$4,'cancelled',1)",[user+'-run',user,user+'-flow',user+'-v1']);
 assert.equal((await service.getMap(student)).nodes.find(n=>n.title===user+'-flowpoint')?.progressPercent,0);
 await client.query("UPDATE workflow_runs SET status='completed' WHERE id=$1",[user+'-run']);assert.equal((await service.getMap(student)).nodes.find(n=>n.title===user+'-flowpoint')?.progressPercent,100);check('取消运行不增加进度；已发布版本完成运行产生证据');
 await client.query("UPDATE workflow_versions SET published_at=NULL WHERE id=$1",[user+'-v1']);assert.ok(!(await service.getMap(student)).nodes.some(n=>n.title===user+'-flowpoint'));check('草稿版本不会生成学生知识节点');
 await client.query("UPDATE courses SET status='archived' WHERE id=$1",[course]);map=await service.getMap(student);assert.ok(!map.bindings.some(r=>r.targetId===course||r.targetId===lesson));check('下架课程与其课时资源不外露');
 await service.getAbilities(student);await service.getToolTrail(student);await service.getGrowth(student);check('四个知识视图真实SQL可执行');
 console.log('Knowledge database verification: '+checks+' passed. All fixtures rolled back.');
 }finally{await client.query('ROLLBACK');client.release();await pool.end();}
}
void main().catch(e=>{console.error(e.message);process.exitCode=1;});
