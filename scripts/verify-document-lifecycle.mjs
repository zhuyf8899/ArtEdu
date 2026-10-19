// Offline fixtures plus rollback-only database checks. Never deletes existing content.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
const api = createRequire(new URL('../apps/api/package.json',import.meta.url));
const root=fileURLToPath(new URL('../',import.meta.url));
const output=new URL('../apps/api/data/qa/platform-completion-20261019/',import.meta.url);
await mkdir(output,{recursive:true});
const {Document,Packer,Paragraph,TextRun,HeadingLevel,PageBreak,Table,TableRow,TableCell}=api('docx');
const word=new Document({sections:[{children:[
  new Paragraph({text:'AI 辅助纹样创作 · 课堂讲义',heading:HeadingLevel.TITLE}),
  new Paragraph({text:'一、从观察到表达',heading:HeadingLevel.HEADING_1}),
  new Paragraph({children:[new TextRun('理解传统纹样中的'),new TextRun({text:'结构、节奏与色彩',bold:true}),new TextRun('，再选择适合的工具开展创作。')]}),
  new Table({rows:[new TableRow({children:['学习内容','课堂任务'].map(text=>new TableCell({children:[new Paragraph(text)]}))}),new TableRow({children:['观察与提炼','提取三个具有代表性的形态特征'].map(text=>new TableCell({children:[new Paragraph(text)]}))})]}),
  new Paragraph({children:[new PageBreak()]}),new Paragraph({text:'二、练习与反思',heading:HeadingLevel.HEADING_1}),
  new Paragraph('完成一张纹样设计，并说明工具选择、迭代过程与最终的设计判断。'),
]}]});
await writeFile(new URL('preview-sample.docx',output),await Packer.toBuffer(word));
const PptxGenJS=api('pptxgenjs');const deck=new PptxGenJS();deck.layout='LAYOUT_WIDE';deck.author='ArtEdu QA';
for(const [index,title,body]of [[0,'AI 辅助纹样创作','从观察传统纹样，到建立自己的创作方法。'],[1,'结构 · 节奏 · 色彩','01 提炼形态\n02 重组结构\n03 选择工具并反复迭代'],[2,'课堂练习与反思','提交一张纹样作品，并记录你的创作判断。']]){const slide=deck.addSlide();slide.background={color:'F2EFFB'};slide.addText(`ARTEDU / ${String(index+1).padStart(2,'0')}`,{x:.7,y:.5,w:10,h:.4,fontSize:14,color:'6554E8',fontFace:'Microsoft YaHei'});slide.addText(title,{x:.7,y:1.7,w:11.5,h:1,fontSize:34,bold:true,color:'111838',fontFace:'Microsoft YaHei'});slide.addText(body,{x:.75,y:3.2,w:11,h:2,fontSize:23,color:'55506F',fontFace:'Microsoft YaHei',breakLine:false});}
await writeFile(new URL('preview-sample.pptx',output),Buffer.from(await deck.write({outputType:'nodebuffer'})));
console.log('Created offline DOCX (2 pages) and PPTX (3 slides) fixtures.');
if(process.argv.includes('--samples-only'))process.exit(0);
api('dotenv').config({path:root+'apps/api/.env',quiet:true});
const {Pool}=api('pg');const pool=new Pool({connectionString:process.env.DATABASE_URL});const client=await pool.connect();
const {AdminService}=api('./dist/modules/admin/admin.service.js');
try{
  await client.query('BEGIN');
  const admin=await client.query("SELECT id AS user_id FROM users WHERE username='admin.demo' LIMIT 1");
  assert.ok(admin.rows.length,'existing administrator required');const actor={id:admin.rows[0].user_id,roles:['admin']};
  const course='qa-lifecycle-'+randomUUID(),work='qa-case-'+randomUUID();
  await client.query("INSERT INTO courses(id,slug,title,status,created_by) VALUES($1,$1,'QA rollback only','pending_review',$2)",[course,actor.id]);
  await client.query("INSERT INTO course_reviews(id,course_id,submitter_id,snapshot_version) VALUES($1,$2,$3,1)",['qa-review-'+randomUUID(),course,actor.id]);
  await client.query("INSERT INTO course_enrollments(id,course_id,user_id) VALUES($1,$2,$3)",['qa-enroll-'+randomUUID(),course,actor.id]);
  await client.query("INSERT INTO works(id,title,status,author_id) VALUES($1,'QA rollback only','approved',$2)",[work,actor.id]);
  await client.query("INSERT INTO comments(id,work_id,author_id,content) VALUES($1,$2,$3,'QA preserved comment')",['qa-comment-'+randomUUID(),work,actor.id]);
  const service=new AdminService({requireAnyRole(){}} ,{transaction:fn=>fn(client),query:(...args)=>client.query(...args)},{});
  await service.changeContentLifecycle(actor,'course',course,{action:'archive',reason:'验证回收站',expectedStatus:'pending_review'});
  assert.equal((await client.query('SELECT status FROM course_reviews WHERE course_id=$1',[course])).rows[0].status,'rejected');
  assert.equal((await client.query('SELECT COUNT(*)::int AS n FROM course_enrollments WHERE course_id=$1',[course])).rows[0].n,1);
  await service.changeContentLifecycle(actor,'course',course,{action:'restore',reason:'验证恢复草稿',expectedStatus:'archived'});
  await service.changeContentLifecycle(actor,'work',work,{action:'archive',reason:'验证案例下架',expectedStatus:'approved'});
  assert.equal((await client.query('SELECT COUNT(*)::int AS n FROM comments WHERE work_id=$1',[work])).rows[0].n,1);
  assert.ok((await service.listManagedWorks(actor)).items.some(item=>item.id===work&&item.status==='archived'));
  await service.changeContentLifecycle(actor,'work',work,{action:'restore',reason:'验证案例恢复',expectedStatus:'archived'});
  for(const [table,id] of [['courses',course],['works',work]])assert.equal((await client.query(`SELECT status FROM ${table} WHERE id=$1`,[id])).rows[0].status,'draft');
  assert.equal((await client.query('SELECT COUNT(*)::int AS n FROM audit_records WHERE target_id=ANY($1::text[])',[[course,work]])).rows[0].n,4);
  await client.query("INSERT INTO audit_records(id,target_type,target_id,reviewer_id,action,reason) VALUES($1,'user_usage_limit',$2,$3,'bulk_update_quota','QA audit compatibility')",[randomUUID(),'qa-bulk-'+randomUUID(),actor.id]);
  console.log('Live database lifecycle checks passed; enrollment, comments and 4 audit events retained.');
}finally{await client.query('ROLLBACK');client.release();await pool.end();console.log('Rolled back all QA records; existing courses/cases untouched.');}
