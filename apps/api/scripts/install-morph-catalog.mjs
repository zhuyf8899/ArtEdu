/** Versioned, explicit content deployment. Never delete courses or write user progress. */
import 'dotenv/config';
import pg from 'pg';
import { createHash, randomUUID } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {readToolCopy,applyToolCopy,writeToolCopyBackup} from './revise-morph-tool-copy.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const hash=value=>createHash('sha256').update(value).digest('hex');
export const oldCourses=['course-ai-design-foundation','course-traditional-pattern','course-vibe-gallery'];
export const oldTools=['tool-directory-figma','tool-directory-canva','tool-directory-photopea','tool-directory-behance','tool-directory-unsplash'];

export function validateCatalog(bundle) {
  if(bundle.id!=='morph-catalog-v1'||bundle.version!==1||bundle.courses?.length!==13||bundle.tools?.length!==19)throw new Error('Unexpected catalog identity/count');
  if(JSON.stringify(bundle.archiveCourseIds)!==JSON.stringify(oldCourses)||JSON.stringify(bundle.archiveToolIds)!==JSON.stringify(oldTools))throw new Error('Archive targets differ from approved legacy IDs');
  const ids=new Set(), lessons=new Set();
  for(const c of bundle.courses) {
    if(!/^morph-course-[a-z]+-\d{2}$/.test(c.id)||ids.has(c.id)||!c.title||!c.summary||!['trial','coming_soon'].includes(c.availability)||c.reviewStatus!=='pending'||c.authorLabel!=='作者待确认')throw new Error('Invalid course');
    ids.add(c.id);
    if(c.progress!==undefined||c.metrics!==undefined||c.creatorName!==undefined)throw new Error('Demo identity/statistics forbidden');
    if(!Array.isArray(c.lessons)||(c.availability==='trial'?c.lessons.length!==3:c.lessons.length!==0)||!Number.isInteger(c.estimatedMinutes)||c.estimatedMinutes<=0)throw new Error('Invalid course readiness');
    for(const l of c.lessons) {
      if(!/^[a-z]+$/.test(l.id)||lessons.has(c.id+'/'+l.id)||!l.teaching?.sections?.length||!l.practiceTask||!l.completionCriteria||l.teaching.reviewStatus!=='pending')throw new Error('Incomplete trial lesson');
      lessons.add(c.id+'/'+l.id);
    }
  }
  if(bundle.courses.filter(c=>c.availability==='trial').length!==3)throw new Error('Expected three trial courses');
  for(const t of bundle.tools) {
    const url=new URL(t.href);
    if(!/^morph-tool-[a-z-]+$/.test(t.id)||ids.has(t.id)||url.protocol!=='https:'||url.username||url.password||url.port||!/^\/(?:codex\/)?$/.test(url.pathname)||url.search||url.hash||!t.detail||!Array.isArray(t.tags))throw new Error('Invalid tool');
    if(t.price!==undefined)throw new Error('Unverified prices forbidden');
    if(t.relatedCourseIds.some(id=>!ids.has(id)))throw new Error('Unknown tool-course association');
  }
  const toolIds=new Set(bundle.tools.map(t=>t.id));
  if(toolIds.size!==19||bundle.courses.some(c=>c.toolIds.some(id=>!toolIds.has(id))))throw new Error('Invalid course-tool association');
  if(!Array.isArray(bundle.assets)||new Set(bundle.assets.map(a=>a.url)).size!==bundle.assets.length)throw new Error('Invalid assets');
  for(const record of [...bundle.courses,...bundle.tools])if(!bundle.assets.some(a=>a.url===record.coverUrl))throw new Error('Missing bundled cover');
  for(const a of bundle.assets)if(!/^\/morph-v17\/assets\/[a-zA-Z0-9_-]+\.(svg|png)$/.test(a.url)||!/^[a-f0-9]{64}$/.test(a.sha256))throw new Error('Unsafe cover');
  return bundle;
}
export async function readCatalog() {
  const raw=await readFile(path.join(root,'seed/morph-catalog/manifest.json'));
  const bundle=validateCatalog(JSON.parse(raw));
  for(const a of bundle.assets) {
    const bytes=await readFile(path.join(root,'admin-console/public',a.url.slice(1)));
    if(hash(a.url.endsWith('.svg')?bytes.toString('utf8').replace(/\r\n/g,'\n'):bytes)!==a.sha256)throw new Error('Bundled cover checksum mismatch: '+a.url);
  }
  return {bundle,checksum:hash(JSON.stringify(bundle))};
}
export async function planCatalog(client,bundle,checksum) {
  const installation=await client.query('SELECT * FROM content_bundle_installs WHERE id=$1',[bundle.id]);
  if(installation.rows[0]) {
    if(installation.rows[0].checksum!==checksum)throw new Error('Installed version differs; create a new version rather than overwriting administrator edits');
    if(installation.rows[0].rolled_back_at)throw new Error('This version was rolled back; inspect records and prepare a new version');
    return {alreadyInstalled:true,id:bundle.id};
  }
  const courseIds=bundle.courses.map(c=>c.id),toolIds=bundle.tools.map(t=>t.id);
  const existing=await client.query('SELECT id FROM courses WHERE id=ANY($1::text[]) UNION ALL SELECT id FROM tool_directory_links WHERE id=ANY($2::text[])',[courseIds,toolIds]);
  if(existing.rows.length)throw new Error('Target IDs already exist without an install journal; refusing to overwrite');
  const courses=await client.query('SELECT * FROM courses WHERE id=ANY($1::text[]) ORDER BY id',[bundle.archiveCourseIds]);
  const tools=await client.query('SELECT * FROM tool_directory_links WHERE id=ANY($1::text[]) ORDER BY id',[bundle.archiveToolIds]);
  return {id:bundle.id,alreadyInstalled:false,newCourses:13,newTools:19,trialCourses:3,comingSoon:10,archiveCourses:courses.rows,archiveTools:tools.rows};
}
export async function installCatalog(client,bundle,checksum,backupWriter) {
  await client.query('BEGIN');
  try {
    await client.query('SELECT pg_advisory_xact_lock(7410637)');
    const plan=await planCatalog(client,bundle,checksum);
    if(plan.alreadyInstalled) {await client.query('COMMIT');return plan;}
    // A failed backup must prevent every catalog mutation. Only affected public
    // content metadata is backed up; no password/session/user-history export.
    const snapshot={bundleId:bundle.id,checksum,courses:plan.archiveCourses,tools:plan.archiveTools,newCourseIds:bundle.courses.map(c=>c.id),newToolIds:bundle.tools.map(t=>t.id)};
    await backupWriter(snapshot);
    await client.query("UPDATE courses SET status='archived',is_featured=FALSE,updated_at=CURRENT_TIMESTAMP WHERE id=ANY($1::text[])",[bundle.archiveCourseIds]);
    await client.query("UPDATE tool_directory_links SET status='archived',updated_at=CURRENT_TIMESTAMP WHERE id=ANY($1::text[])",[bundle.archiveToolIds]);
    for(const c of bundle.courses) {
      const {lessons,...meta}=c;
      await client.query(`INSERT INTO courses(id,slug,title,summary,category,difficulty,cover_url,is_featured,featured_rank,status,estimated_minutes,published_at,catalog_json,knowledge_points)
        VALUES($1,$1,$2,$3,$4,$5,$6,$7,$8,'published',$9,CURRENT_TIMESTAMP,$10::jsonb,$11::jsonb)`,
      [c.id,c.title,c.summary,c.category,c.difficulty,c.coverUrl,c.availability==='trial',bundle.courses.indexOf(c),c.estimatedMinutes,JSON.stringify({...meta,bundleId:bundle.id}),JSON.stringify([...new Set(lessons.flatMap(l=>l.knowledgePoints))])]);
      for(const l of lessons)await client.query(`INSERT INTO course_lessons(id,course_id,title,summary,lesson_type,sort_order,estimated_minutes,status,knowledge_points,learning_steps,practice_task,completion_criteria,requires_work_submission,teaching_json)
        VALUES($1,$2,$3,$4,$5,$6,$7,'published',$8::jsonb,$9::jsonb,$10,$11,$12,$13::jsonb)`,
      [`${c.id}-${l.id}`,c.id,l.title,l.summary,l.requiresWorkSubmission?'assignment':'lesson',lessons.indexOf(l),l.estimatedMinutes,JSON.stringify(l.knowledgePoints),JSON.stringify(l.learningSteps),l.practiceTask,l.completionCriteria,l.requiresWorkSubmission,JSON.stringify(l.teaching)]);
      for(const name of [...new Set([c.category,c.method,...c.tools])]) {
        const tagId='morph-tag-'+hash(name).slice(0,16);
        const tag=await client.query('INSERT INTO tags(id,name,slug) VALUES($1,$2,$1) ON CONFLICT(name) DO UPDATE SET name=EXCLUDED.name RETURNING id',[tagId,name]);
        await client.query('INSERT INTO course_tags(course_id,tag_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[c.id,tag.rows[0].id]);
      }
    }
    for(const t of bundle.tools)await client.query(`INSERT INTO tool_directory_links(id,category,name,detail,href,cover_image_url,icon_key,launch_mode,is_featured,sort_order,status,catalog_json)
      VALUES($1,$2,$3,$4,$5,$6,'link','new_tab',FALSE,$7,'active',$8::jsonb)`,[t.id,t.category,t.name,t.detail,t.href,t.coverUrl,bundle.tools.indexOf(t),JSON.stringify({...t,bundleId:bundle.id})]);
    await client.query('INSERT INTO content_bundle_installs(id,checksum,snapshot_json) VALUES($1,$2,$3::jsonb)',[bundle.id,checksum,JSON.stringify(snapshot)]);
    await client.query('COMMIT');
    return {id:bundle.id,newCourses:13,newTools:19,trialCourses:3,comingSoon:10,archivedCourses:plan.archiveCourses.length,archivedTools:plan.archiveTools.length};
  } catch(error) {await client.query('ROLLBACK');throw error;}
}
export async function rollbackCatalog(client,id) {
  await client.query('BEGIN');
  try {
    await client.query('SELECT pg_advisory_xact_lock(7410637)');
    const {rows}=await client.query('SELECT * FROM content_bundle_installs WHERE id=$1 FOR UPDATE',[id]);
    const install=rows[0];if(!install||install.rolled_back_at)throw new Error('No active installation to roll back');
    const s=install.snapshot_json;
    // Never overwrite later administrative changes, and never delete learning.
    const changed=await client.query(`SELECT id FROM courses WHERE id=ANY($1::text[]) AND updated_at>$3
      UNION ALL SELECT id FROM tool_directory_links WHERE id=ANY($2::text[]) AND updated_at>$3
      UNION ALL SELECT id FROM course_lessons WHERE course_id=ANY($4::text[]) AND updated_at>$3`,
    [[...s.newCourseIds,...s.courses.map(c=>c.id)],[...s.newToolIds,...s.tools.map(t=>t.id)],install.installed_at,s.newCourseIds]);
    if(changed.rows.length)throw new Error('Content changed after installation; manual rollback review required');
    await client.query("UPDATE courses SET status='archived',is_featured=FALSE WHERE id=ANY($1::text[])",[s.newCourseIds]);
    await client.query("UPDATE tool_directory_links SET status='archived' WHERE id=ANY($1::text[])",[s.newToolIds]);
    for(const c of s.courses)await client.query('UPDATE courses SET status=$2,is_featured=$3,updated_at=$4 WHERE id=$1',[c.id,c.status,c.is_featured,c.updated_at]);
    for(const t of s.tools)await client.query('UPDATE tool_directory_links SET status=$2,updated_at=$3 WHERE id=$1',[t.id,t.status,t.updated_at]);
    await client.query('UPDATE content_bundle_installs SET rolled_back_at=CURRENT_TIMESTAMP WHERE id=$1',[id]);
    await client.query('COMMIT');return {id,rolledBack:true,personalHistoryPreserved:true};
  }catch(error){await client.query('ROLLBACK');throw error;}
}
async function main() {
  const mode=process.argv[2]||'--plan';
  if(!['--verify','--plan','--apply','--rollback'].includes(mode))throw new Error('Use --verify, --plan (default), --apply or --rollback');
  const {bundle,checksum}=await readCatalog();
  const copy=await readToolCopy(bundle);
  if(mode==='--verify'){console.log({id:bundle.id,courses:13,tools:19,assets:bundle.assets.length,checksum,copyRevision:copy.revision.id});return;}
  if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL is required; run from apps/api');
  const client=new pg.Client({connectionString:process.env.DATABASE_URL});await client.connect();
  try {
    if(mode==='--rollback') {console.log(await rollbackCatalog(client,bundle.id));return;}
    if(mode==='--plan') {const plan=await planCatalog(client,bundle,checksum);console.log({...plan,archiveCourses:plan.archiveCourses?.map(c=>({id:c.id,title:c.title,status:c.status})),archiveTools:plan.archiveTools?.map(t=>({id:t.id,name:t.name,status:t.status}))});return;}
    console.log(await installCatalog(client,bundle,checksum,async snapshot=>{
      const dir=path.join(root,'apps/api/data/catalog-backups');await mkdir(dir,{recursive:true});
      const target=path.join(dir,`${bundle.id}-${randomUUID()}.json`);
      await writeFile(target,JSON.stringify(snapshot,null,2),{flag:'wx',mode:0o600});console.log('Content backup saved:',path.relative(root,target));
    }));
    console.log(await applyToolCopy(client,bundle,copy.revision,copy.checksum,writeToolCopyBackup));
  } finally {await client.end();}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{console.error(error.message);process.exitCode=1;});
