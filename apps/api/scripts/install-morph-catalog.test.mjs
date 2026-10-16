import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {readCatalog,validateCatalog,planCatalog,installCatalog,rollbackCatalog} from './install-morph-catalog.mjs';
import {readToolCopy,planToolCopy,applyToolCopy,rollbackToolCopy} from './revise-morph-tool-copy.mjs';

const {bundle,checksum}=await readCatalog();
const copy=await readToolCopy(bundle);

const copyRows=()=>bundle.tools.map(t=>({id:t.id,name:t.name,detail:t.detail,href:t.href,category:t.category,cover_image_url:t.coverUrl,status:'active',catalog_json:{...t,bundleId:bundle.id},original_updated_at:'2026-10-16 00:00:00.123456+00'}));
const copyDb=(options={})=>{
  const statements=[];
  return {statements,query:async(sql,values=[])=>{
    statements.push({sql,values});
    if(sql.startsWith('SELECT * FROM content_bundle_installs'))return {rows:values[0]===bundle.id?[{checksum}]:options.installed?[options.installed]:[]};
    if(sql.startsWith('SELECT *,updated_at'))return {rows:options.rows||copyRows()};
    if(sql.startsWith('SELECT id,detail,catalog_json'))return {rows:options.after||[]};
    return {rows:[]};
  }};
};
test('v2 restores all 19 handoff descriptions/subtitles without altering v1 or adding prices',()=>{
  assert.equal(copy.revision.tools.length,19);
  assert.ok(copy.revision.tools.every(t=>t.detail.length>25&&t.subtitle&&!('price' in t)&&!('href' in t)));
  assert.equal(copy.revision.tools.find(t=>t.name==='Figma').detail,'界面设计、原型与设计系统都在同一块画布上完成。多人实时协作，组件与变量体系是团队交付的通用语言。');
  assert.notEqual(copy.revision.tools[0].detail,bundle.tools[0].detail);
});
test('copy revision preflight is read-only and refuses edited or missing targets',async()=>{
  const db=copyDb();assert.equal((await planToolCopy(db,bundle,copy.revision,copy.checksum)).tools,19);
  assert.ok(db.statements.every(s=>s.sql.startsWith('SELECT')));
  const edited=copyRows();edited[0].detail='管理员的新简介';
  await assert.rejects(planToolCopy(copyDb({rows:edited}),bundle,copy.revision,copy.checksum),/edited/);
  await assert.rejects(planToolCopy(copyDb({rows:[]}),bundle,copy.revision,copy.checksum),/Missing/);
});
test('copy revision backs up first, is idempotent, and never writes learning history',async()=>{
  const bad=copyDb();await assert.rejects(applyToolCopy(bad,bundle,copy.revision,copy.checksum,async()=>{throw Error('backup failed');}),/backup failed/);
  assert.ok(!bad.statements.some(s=>/^(UPDATE|INSERT)/.test(s.sql)));
  const db=copyDb();let backup;
  await applyToolCopy(db,bundle,copy.revision,copy.checksum,async s=>{backup=s;});
  assert.equal(backup.tools.length,19);assert.equal(backup.tools[0].updated_at,'2026-10-16 00:00:00.123456+00');
  assert.equal(db.statements.filter(s=>s.sql.startsWith('UPDATE tool_directory_links')).length,19);
  assert.doesNotMatch(db.statements.map(s=>s.sql).join('\n'),/DELETE|learning_progress|course_enrollments|UPDATE courses/);
  const installed=copyDb({installed:{checksum:copy.checksum}});
  assert.equal((await applyToolCopy(installed,bundle,copy.revision,copy.checksum,()=>assert.fail())).alreadyInstalled,true);
  assert.ok(!installed.statements.some(s=>/^(UPDATE|INSERT)/.test(s.sql)));
});
test('copy rollback restores only exact journaled text and refuses later edits',async()=>{
  const before=copyRows().map(t=>({id:t.id,detail:t.detail,catalog_json:t.catalog_json,updated_at:t.original_updated_at}));
  const after=[{id:'morph-tool-figma',detail:'new',catalog_json:{},updated_at:'2026-10-16 01:00:00+00'}];
  const installed={checksum:copy.checksum,snapshot_json:{kind:'tool-copy',tools:before,after}};
  const reordered=after.map(row=>({updated_at:row.updated_at,catalog_json:row.catalog_json,detail:row.detail,id:row.id}));
  const db=copyDb({installed,after:reordered});assert.equal((await rollbackToolCopy(db,copy.revision.id)).rolledBack,true);
  assert.equal(db.statements.filter(s=>s.sql.startsWith('UPDATE tool_directory_links')).length,19);
  await assert.rejects(rollbackToolCopy(copyDb({installed,after:[]}),copy.revision.id),/changed after/);
});
const fake=(options={})=>{
  const statements=[];
  return {statements,query:async(sql,values)=>{
    statements.push({sql,values});
    if(sql.startsWith('SELECT * FROM content_bundle_installs'))return {rows:options.install?[options.install]:[]};
    if(sql.includes('AND updated_at>$3'))return {rows:options.edited?[{id:'edited'}]:[]};
    if(sql.startsWith('SELECT id FROM courses WHERE id=ANY'))return {rows:options.conflict?[{id:'occupied'}]:[]};
    if(sql.startsWith('SELECT * FROM courses'))return {rows:[{id:'course-ai-design-foundation',status:'published',is_featured:true}]};
    if(sql.startsWith('SELECT * FROM tool_directory'))return {rows:[{id:'tool-directory-figma',status:'active'}]};
    if(sql.startsWith('INSERT INTO tags'))return {rows:[{id:values[0]}]};
    return {rows:[]};
  }};
};
test('bundle has 13 real catalog entries, 3 distinct trial courses, 19 tools and portable covers',()=>{
  assert.equal(bundle.courses.length,13);assert.equal(bundle.tools.length,19);
  assert.equal(bundle.courses.filter(c=>c.availability==='coming_soon').length,10);
  assert.equal(new Set(bundle.courses.flatMap(c=>c.lessons.map(l=>l.title))).size,9);
  assert.ok(bundle.courses.filter(c=>c.availability==='trial').every(c=>c.lessons.at(-1).requiresWorkSubmission));
  assert.ok(bundle.courses.every(c=>c.authorLabel==='作者待确认'&&!('progress' in c)&&!('metrics' in c)));
  assert.ok(bundle.tools.every(t=>!('price' in t)&&new URL(t.href).protocol==='https:'));
});
test('validator rejects changed archive scope, bad covers, demo progress and missing exercises',()=>{
  const change=f=>{const b=structuredClone(bundle);f(b);return b;};
  assert.throws(()=>validateCatalog(change(b=>b.archiveCourseIds.push('unrelated-course'))));
  assert.throws(()=>validateCatalog(change(b=>b.assets[0].url='/../../secret.svg')));
  assert.throws(()=>validateCatalog(change(b=>b.courses[0].progress=60)));
  assert.throws(()=>validateCatalog(change(b=>b.courses[0].lessons[0].practiceTask='')));
  assert.throws(()=>validateCatalog(change(b=>b.tools[0].href='javascript:alert(1)')));
});
test('plan is read-only and refuses target ID collisions',async()=>{
  const db=fake();const plan=await planCatalog(db,bundle,checksum);assert.equal(plan.newCourses,13);
  assert.ok(db.statements.every(s=>s.sql.startsWith('SELECT')));
  await assert.rejects(planCatalog(fake({conflict:true}),bundle,checksum),/refusing to overwrite/);
});
test('failed backup rolls back before catalog writes; successful install never writes personal history',async()=>{
  const db=fake();await assert.rejects(installCatalog(db,bundle,checksum,async()=>{throw new Error('disk full');}),/disk full/);
  assert.ok(!db.statements.some(s=>/^(UPDATE|INSERT)/.test(s.sql)));assert.equal(db.statements.at(-1).sql,'ROLLBACK');
  const good=fake();let backup=false;await installCatalog(good,bundle,checksum,async s=>{assert.equal(s.courses[0].status,'published');backup=true;});
  assert.ok(backup);assert.equal(good.statements.filter(s=>s.sql.startsWith('INSERT INTO courses(')).length,13);
  assert.equal(good.statements.filter(s=>s.sql.startsWith('INSERT INTO course_lessons(')).length,9);
  assert.equal(good.statements.filter(s=>s.sql.startsWith('INSERT INTO tool_directory_links(')).length,19);
  assert.doesNotMatch(good.statements.map(s=>s.sql).join('\n'),/DELETE|INSERT INTO learning_progress|UPDATE learning_progress|INSERT INTO course_enrollments|UPDATE works/);
});
test('repeat installation is a no-op and changed bundles cannot overwrite administrator edits',async()=>{
  const db=fake({install:{checksum}});await installCatalog(db,bundle,checksum,()=>assert.fail('no second backup'));
  assert.ok(!db.statements.some(s=>/^(UPDATE|INSERT)/.test(s.sql)));
  await assert.rejects(planCatalog(fake({install:{checksum:'different'}}),bundle,checksum),/differs/);
});
test('rollback archives imported content instead of deleting it, and refuses subsequent edits',async()=>{
  const install={checksum,installed_at:new Date(),snapshot_json:{newCourseIds:['new-c'],newToolIds:['new-t'],courses:[{id:'old-c',status:'published',is_featured:true}],tools:[]}};
  const db=fake({install});assert.equal((await rollbackCatalog(db,bundle.id)).personalHistoryPreserved,true);
  assert.doesNotMatch(db.statements.map(s=>s.sql).join('\n'),/DELETE|learning_progress|course_enrollments/);
  await assert.rejects(rollbackCatalog(fake({install,edited:true}),bundle.id),/manual rollback/);
});
test('new content is displayed as structured text and coming-soon enrollment is guarded on server',async()=>{
  const root=new URL('../../../',import.meta.url);
  const api=await readFile(new URL('apps/api/src/modules/courses/courses.service.ts',root),'utf8');
  assert.match(api,/catalog_json\?\.availability === 'coming_soon'/);assert.match(api,/AVG\(COALESCE\(p.progress_percent, 0\)\)/);
  const ui=await readFile(new URL('admin-console/src/morph/TrialLesson.jsx',root),'utf8');
  assert.doesNotMatch(ui,/dangerouslySetInnerHTML/);assert.match(ui,/teaching\.sections\.map/);
});
test('content deployment uses the same installer locally and in container builds',async()=>{
  const root=new URL('../../../',import.meta.url);
  const local=await readFile(new URL('scripts/start-local.ps1',root),'utf8');
  const staging=await readFile(new URL('deploy/deploy-staging.sh',root),'utf8');
  const docker=await readFile(new URL('deploy/Dockerfile.api',root),'utf8');
  assert.match(local,/catalog:install/);assert.match(staging,/catalog:install/);
  assert.match(docker,/COPY admin-console\/public\/morph-v17/);
  const css=await readFile(new URL('admin-console/src/morph/content-catalog.css',root),'utf8');
  assert.match(css,/course-cover>\.status\{right:auto;bottom:auto;height:auto/);
  assert.match(css,/learning-detail__hero h2\{font-size:30px;line-height:1\.4/);
});
