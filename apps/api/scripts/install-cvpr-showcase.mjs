/** Restore the owner's nine previously published CVPR cases, never the whole DB.
 * Media is supplied separately from Git; missing files are repaired by hash.
 * Existing edits, other works, account identities and learner records stay intact.
 */
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {createReadStream,createWriteStream} from 'node:fs';
import {readFile,stat,lstat,mkdir,link,rm} from 'node:fs/promises';
import {pipeline} from 'node:stream/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

export const bundleId='cvpr-featured-recovery-20261029-v1';
export function assetPath(root,key,work){
 const prefix=`users/${work.authorId}/works/${work.id}/`;
 assert.match(work.authorId,/^[A-Za-z0-9_-]+$/);assert.match(work.id,/^work-[a-f0-9-]{36}$/);
 assert.ok(key.startsWith(prefix)&&/^[a-f0-9-]{36}-[a-f0-9-]{36}$/.test(key.slice(prefix.length)),'Unsafe media path');
 const target=path.resolve(root,...key.split('/'));assert.ok(target.startsWith(path.resolve(root)+path.sep));return target;
}
export async function fileHash(file){const hash=createHash('sha256');for await(const b of createReadStream(file))hash.update(b);return hash.digest('hex');}
export async function verifyBundle(root){
 const manifest=JSON.parse(await readFile(path.join(root,'manifest.json'),'utf8'));
 assert.equal(manifest.id,bundleId);assert.equal(manifest.version,1);assert.equal(manifest.cases.length,9);
 const ids=new Set(),assets=new Set();let images=0,videos=0,bytes=0;
 for(const work of manifest.cases){
  assert.ok(!ids.has(work.id));ids.add(work.id);assert.equal(work.authorId,'user-operator-demo');
  assert.equal(work.story.collection,'art-selection');assert.equal(work.story.authorization,'confirmed');assert.equal(work.story.origin,'collected');
  assert.equal(work.story.displayStyle,'exhibition');assert.ok(work.story.creators.length);assert.equal(new URL(work.story.originalUrl).hostname,'thecvf-art.com');
  assert.ok(!work.story.authorizationNote&&!work.story.editorialNote,'Private import notes must not be exported');
  assert.ok(work.summary.length>300);assert.ok(work.assets.length<=10);
  for(const a of work.assets){
   assert.ok(!assets.has(a.id));assets.add(a.id);assert.match(a.sha256,/^[a-f0-9]{64}$/);
   assert.ok(['image/jpeg','image/png','image/webp','video/mp4'].includes(a.mimeType));
   assert.equal(a.assetType,a.mimeType.startsWith('video/')?'video':'image');assetPath('/uploads',a.storageKey,work);
   const source=path.join(root,'media',a.sha256);assert.ok((await lstat(source)).isFile());assert.equal((await stat(source)).size,a.fileSize);assert.equal(await fileHash(source),a.sha256);
   a.assetType==='video'?videos++:images++;bytes+=a.fileSize;
  }
  assert.ok(work.assets.some(a=>a.id===work.story.coverAssetId&&a.assetType==='image'));
 }
 assert.equal(images,30);assert.equal(videos,13);return {manifest,images,videos,bytes};
}
export function assertExisting(existing,expected){
 assert.equal(existing.id,expected.id,'Conflicting identity');assert.equal(existing.title,expected.title);assert.equal(existing.status,'approved');
 assert.equal(existing.author_id,expected.authorId);assert.equal(existing.story_json?.collection,'art-selection');
 assert.equal(existing.story_json?.originalUrl,expected.story.originalUrl);assert.deepEqual(existing.story_json?.creators,expected.story.creators);
}
async function installFile(source,target,hash){
 try{assert.ok((await lstat(target)).isFile());assert.equal(await fileHash(target),hash,'Existing media differs');return false;}catch(e){if(e.code!=='ENOENT')throw e;}
 await mkdir(path.dirname(target),{recursive:true});const temporary=target+'.cvpr-'+randomUUID();
 try{await pipeline(createReadStream(source),createWriteStream(temporary,{flags:'wx',mode:0o600}));assert.equal(await fileHash(temporary),hash);await link(temporary,target);return true;}finally{await rm(temporary,{force:true});}
}
async function run(){
 const [mode,rootArg]=process.argv.slice(2);assert.ok(['--verify','--plan','--apply'].includes(mode)&&rootArg,'Usage: --verify|--plan|--apply <bundle-directory>');
 const root=path.resolve(rootArg),{manifest,images,videos,bytes}=await verifyBundle(root);
 const summary={bundleId,cases:9,images,videos,bytes};if(mode==='--verify'){console.log(JSON.stringify(summary));return;}
 const require=createRequire(path.join(process.cwd(),'package.json'));const {Client}=require('pg');
 assert.ok(process.env.DATABASE_URL);assert.ok(process.env.UPLOAD_ROOT);const uploadRoot=path.resolve(process.env.UPLOAD_ROOT);
 const db=new Client({connectionString:process.env.DATABASE_URL});await db.connect();
 const ids=manifest.cases.map(w=>w.id);let restoredFiles=0,created=0;
 async function fingerprints(){const result={};
  for(const table of ['works','work_assets','work_tags','course_enrollments','learning_progress','learning_notes','learning_tasks','course_lesson_submissions','atomic_progress','workflow_runs','work_likes','work_favorites','comments']){
   const key=table==='works'?'id':['work_assets','work_tags'].includes(table)?'work_id':null;
   result[table]=(await db.query(`SELECT count(*)::int AS count,md5(COALESCE(string_agg(row_to_json(t)::text,'' ORDER BY row_to_json(t)::text),'')) AS digest FROM ${table} t${key?` WHERE ${key}<>ALL($1::text[])`:''}`,key?[ids]:[])).rows[0];
  }return result;
 }
 try{
  await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ');await db.query('SELECT pg_advisory_xact_lock(202610299)');
  const before=await fingerprints();assert.equal((await db.query('SELECT id FROM users WHERE id=$1',['user-operator-demo'])).rowCount,1,'Original publisher must already exist; do not clone accounts');
  const existing=(await db.query("SELECT * FROM works WHERE id=ANY($1::text[]) OR title=ANY($2::text[]) OR story_json->>'originalUrl'=ANY($3::text[]) FOR UPDATE",[ids,manifest.cases.map(w=>w.title),manifest.cases.map(w=>w.story.originalUrl)])).rows;
  for(const row of existing){const expected=manifest.cases.find(w=>w.id===row.id);assert.ok(expected,'Duplicate case under another ID');assertExisting(row,expected);}
  const assetRows=(await db.query('SELECT * FROM work_assets WHERE id=ANY($1::text[]) OR work_id=ANY($2::text[])',[manifest.cases.flatMap(w=>w.assets.map(a=>a.id)),ids])).rows;
  for(const row of assetRows){const work=manifest.cases.find(w=>w.id===row.work_id),a=work?.assets.find(a=>a.id===row.id);assert.ok(a,'Unrecognized existing asset');assert.equal(row.sha256,a.sha256);assert.equal(row.storage_key,a.storageKey);assert.equal(row.asset_type,a.assetType);assert.equal(Number(row.file_size),a.fileSize);assert.equal(row.moderation_status,'approved');}
  // Preflight all target files before any mutation.
  for(const w of manifest.cases)for(const a of w.assets){const file=assetPath(uploadRoot,a.storageKey,w);try{assert.ok((await lstat(file)).isFile());assert.equal(await fileHash(file),a.sha256,'Existing upload conflicts');}catch(e){if(e.code!=='ENOENT')throw e;}}
  if(mode==='--plan'){await db.query('ROLLBACK');console.log(JSON.stringify({...summary,existing:existing.length,missing:9-existing.length,mode}));return;}
  for(const w of manifest.cases)for(const a of w.assets)if(await installFile(path.join(root,'media',a.sha256),assetPath(uploadRoot,a.storageKey,w),a.sha256))restoredFiles++;
  for(const w of manifest.cases){
   if(!existing.some(row=>row.id===w.id)){
    const story={...w.story,authorizationNote:'原平台已确认展示授权；依原发布回执恢复。',editorialNote:'2026-10-29：从原发布回执及校验一致的媒体恢复；不是新的审核决定。'};
    await db.query(`INSERT INTO works(id,author_id,title,summary,discipline,is_featured,featured_rank,status,published_at,created_at,updated_at,story_json) VALUES($1,$2,$3,$4,$5,$6,$7,'approved',$8,$9,$10,$11::jsonb)`,[w.id,w.authorId,w.title,w.summary,w.discipline,w.isFeatured,w.featuredRank,w.publishedAt,w.createdAt,w.updatedAt,JSON.stringify(story)]);created++;
    for(const tag of w.tags){const stable=createHash('sha256').update(tag).digest('hex').slice(0,24);await db.query('INSERT INTO tags(id,name,slug) VALUES($1,$2,$3) ON CONFLICT(name) DO NOTHING',['cvpr-tag-'+stable,tag,'cvpr-'+stable]);await db.query('INSERT INTO work_tags(work_id,tag_id) SELECT $1,id FROM tags WHERE name=$2 ON CONFLICT DO NOTHING',[w.id,tag]);}
    await db.query(`INSERT INTO audit_records(id,target_type,target_id,reviewer_id,action,reason) VALUES($1,'work',$2,NULL,'publish',$3)`,['cvpr-recovery-'+randomUUID(),w.id,'依原已发布回执恢复精选案例，非新的审核决定；恢复批次 '+bundleId]);
   }
   for(const a of w.assets)if(!assetRows.some(row=>row.id===a.id))await db.query(`INSERT INTO work_assets(id,work_id,file_name,mime_type,storage_key,file_size,sha256,asset_type,alt_text,sort_order,moderation_status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'approved')`,[a.id,w.id,a.fileName,a.mimeType,a.storageKey,a.fileSize,a.sha256,a.assetType,a.altText,a.sortOrder]);
  }
  assert.deepEqual(await fingerprints(),before,'Unrelated data changed; transaction cancelled');
  const checksum=createHash('sha256').update(JSON.stringify(manifest)).digest('hex');
  const installed=(await db.query('SELECT checksum FROM content_bundle_installs WHERE id=$1',[bundleId])).rows[0];
  if(installed)assert.equal(installed.checksum,checksum,'Bundle changed');else await db.query('INSERT INTO content_bundle_installs(id,checksum,snapshot_json) VALUES($1,$2,$3::jsonb)',[bundleId,checksum,JSON.stringify({kind:'authorized-cvpr-case-recovery',workIds:ids,assets:43,images,videos,unrelated:before})]);
  await db.query('COMMIT');console.log(JSON.stringify({...summary,created,restoredFiles,unrelatedRecordsUnchanged:true}));
 }catch(e){await db.query('ROLLBACK');throw e;}finally{await db.end();}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))run().catch(e=>{console.error(e.message);process.exitCode=1;});
