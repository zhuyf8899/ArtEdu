import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import {withDatabase} from './run-sql-file';
import {CoursesService} from '../modules/courses/courses.service';
import type {DatabaseService} from '../modules/database/database.service';
import type {AuthService,Actor} from '../modules/auth/auth.service';
import type {RagService} from '../modules/rag/rag.service';
import {PortalService} from '../modules/portal/portal.service';
import type {ModelRegistry} from '../modules/generation/model-registry';

// The outer transaction is ALWAYS rolled back. No real account is enrolled,
// marked complete or given a new work, and no paid generation is invoked.
async function verify(){
  assert.ok(['localhost','127.0.0.1','[::1]'].includes(new URL(process.env.DATABASE_URL!).hostname),'QA transaction is restricted to a local database');
  await withDatabase(async pool=>{
  const client=await pool.connect();await client.query('BEGIN');
  try {
    const id='qa-catalog-'+randomUUID();
    await client.query("INSERT INTO users(id,username,display_name,status) VALUES($1,$1,'临时目录验证','active')",[id]);
    let savepoint=0;
    let queryChain:Promise<unknown>=Promise.resolve();
    const serialQuery=(sql:string,values:unknown[])=>{const result=queryChain.then(()=>client.query(sql,values));queryChain=result.catch(()=>undefined);return result;};
    const database={query:serialQuery,transaction:async(work:(c:PoolClient)=>Promise<unknown>)=>{
      const name='catalog_qa_'+(++savepoint);await client.query('SAVEPOINT '+name);
      try{const result=await work(client);await client.query('RELEASE SAVEPOINT '+name);return result;}catch(e){await client.query('ROLLBACK TO SAVEPOINT '+name);throw e;}
    }} as unknown as DatabaseService;
    const actor={id,displayName:'临时目录验证',roles:['student']} as Actor;
    const courses=new CoursesService(database,{} as AuthService,{} as RagService);
    for(const role of ['student','teacher','operator','admin']) {
      const demo={id:`user-${role}-demo`,displayName:'测试账号',roles:[role]} as Actor;
      const visible=await courses.listPublished(demo,{});
      assert.equal(visible.items.filter(c=>c.catalog?.bundleId==='morph-catalog-v1').length,13);
    }
    const all=await courses.listPublished(actor,{});assert.equal(all.items.filter(c=>c.catalog?.bundleId==='morph-catalog-v1').length,13);
    for(const c of all.items.filter(c=>c.catalog?.bundleId==='morph-catalog-v1')) {
      const detail=await courses.getPublished(actor,c.id);
      if(c.availability==='coming_soon') {
        assert.equal(detail.lessons.length,0);await assert.rejects(courses.enroll(actor,c.id),/筹备中/);
      }else {
        assert.equal(detail.lessons.length,3);assert.ok(detail.lessons.every(l=>l.teaching?.sections?.length));
        assert.equal(detail.progressPercent,0);
      }
    }
    await assert.rejects(courses.getPublished(actor,'course-ai-design-foundation'),/已下架/);
    const c=await courses.enroll(actor,'morph-course-col-01');
    const result=await courses.updateProgress(actor,c.id,c.lessons[0].id,{progressPercent:100,watchedSeconds:0,lastPositionSeconds:0,completionConfirmed:true});
    assert.equal(result.progressPercent,33,'one of three lessons is 33%, not 100%');
    await assert.rejects(courses.updateProgress(actor,c.id,c.lessons[2].id,{progressPercent:100,watchedSeconds:0,lastPositionSeconds:0,completionConfirmed:true}),/关联.*作品/);
    const tasks=await client.query("SELECT * FROM learning_tasks WHERE user_id=$1 AND status='completed'",[id]);assert.equal(tasks.rows.length,1);
    const time=await client.query('SELECT watched_seconds FROM learning_progress WHERE user_id=$1',[id]);assert.equal(time.rows[0].watched_seconds,900);
    const search=new PortalService(database,{} as ModelRegistry);
    const palette=await search.search(actor,{query:'色彩',type:'all'});assert.ok(palette.items.some(x=>x.id==='morph-course-col-01'));
    const tools=await search.search(actor,{query:'Figma',type:'all'});assert.ok(tools.items.some(x=>x.id==='morph-tool-figma'&&x.route.includes('toolQuery=')));
    assert.ok(!palette.items.some(x=>x.id==='course-ai-design-foundation'));
    console.log('Catalog DB regression passed: 13 courses, 9 lessons, coming-soon blocked, 33% progress, task/time updates, submission guard and canonical search. All QA writes rolled back.');
  }finally{await client.query('ROLLBACK');client.release();}
});}
void verify().catch(error=>{console.error(error);process.exitCode=1;});
