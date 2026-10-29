/** Explicit, repeatable import of the user-provided public handoff outlines. No learner evidence is imported. */
import 'dotenv/config';
import pg from 'pg';
import {createHash,randomUUID} from 'node:crypto';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const digest=value=>createHash('sha256').update(value).digest('hex');
const prefix='morph-handoff-';
export function validateAtomicHandoff(bundle){
 if(bundle.id!=='morph-atomic-handoff-20261028-v1'||bundle.version!==1||bundle.nodes.length!==31||bundle.nodes.filter(n=>n.catalogEntry).length!==17||bundle.media.length!==0)throw Error('Unexpected handoff identity/count');
 if(bundle.publisher.id!=='morph-handoff-library'||bundle.publisher.status!=='disabled')throw Error('Publisher must be a non-login source attribution');
 const ids=new Set(),assets=new Set(bundle.media.map(a=>a.id));
 for(const n of bundle.nodes){
  if(!n.id.startsWith(prefix)||ids.has(n.id)||!['teaching','course'].includes(n.kind)||n.readiness!=='outline')throw Error('Invalid imported node');ids.add(n.id);
  if(!['https://morph-lab-design-platform.wj27398.chatgpt.site/infographic-design','https://morph-lab-design-platform.wj27398.chatgpt.site/atomic-courses-particles'].includes(n.sourceUrl))throw Error('Unexpected source');
  if(n.kind==='teaching'&&(n.payload.completion!=='read'||n.payload.assetIds.some(id=>!assets.has(id))))throw Error('Import must not invent practice assessment or assets');
  if(['progress','stage','completed','password','roles'].some(key=>key in n))throw Error('Demo account/progress data forbidden');
 }
 for(const n of bundle.nodes.filter(n=>n.kind==='course'))if(new Set(n.payload.steps.map(s=>s.atomId)).size!==17||n.payload.steps.some(s=>!ids.has(s.atomId)||s.revision!==1||s.task||s.prerequisites.length))throw Error('Invalid versioned source route');
 for(const a of bundle.media)if(!ids.has(a.nodeId)||!/^imported\/morph-atomic-handoff-v1\/morph-handoff-atom-[a-f0-9]{16}\/[A-Za-z0-9_-]+\.png$/.test(a.storageKey)||path.basename(a.storageKey)!==a.filename||a.mimeType!=='image/png'||a.size>10*1024*1024||!/^[a-f0-9]{64}$/.test(a.sha256))throw Error('Unsafe handoff asset');
 return bundle;
}
export async function readAtomicHandoff(){
 const bundle=validateAtomicHandoff(JSON.parse(await readFile(path.join(root,'seed/atomic-handoff/manifest.json'),'utf8')));
 const require=createRequire(import.meta.url),{atomPayload,coursePayload}=require('../dist/modules/atomic/atomic.contracts.js');
 for(const node of bundle.nodes)(node.kind==='course'?coursePayload:atomPayload).parse(node.payload);
 for(const a of bundle.media){const bytes=await readFile(path.join(root,'seed/atomic-handoff/media',a.filename));if(bytes.length!==a.size||digest(bytes)!==a.sha256||bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw Error('Handoff asset checksum mismatch: '+a.filename);}
 for(const a of bundle.coverAssets){const bytes=await readFile(path.join(root,'admin-console/public/morph-course-network/handoff',a.filename));if(bytes.length!==a.size||digest(bytes)!==a.sha256)throw Error('Handoff cover checksum mismatch: '+a.filename);}
 return {bundle,checksum:digest(JSON.stringify(bundle))};
}
export async function installAtomicHandoff(client,bundle,checksum,{apply=false,dryRun=false,uploadRoot}={}){
 await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
 try{
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended('morph-atomic-handoff-v1',0))");
  const installed=await client.query('SELECT checksum,rolled_back_at FROM content_bundle_installs WHERE id=$1',[bundle.id]);
  if(installed.rows[0]){if(installed.rows[0].checksum!==checksum||installed.rows[0].rolled_back_at)throw Error('Installed bundle differs; never overwrite administrator edits');await client.query('ROLLBACK');return {alreadyInstalled:true,nodes:bundle.nodes.length};}
  const conflicts=await client.query('SELECT id FROM atomic_nodes WHERE id=ANY($1::text[])',[bundle.nodes.map(n=>n.id)]);if(conflicts.rows.length)throw Error('Imported node ID conflicts with existing data');
  const publisher=await client.query('SELECT id,username,status,display_name FROM users WHERE id=$1 OR username=$2',[bundle.publisher.id,bundle.publisher.username]);
  if(publisher.rows.length)throw Error('Publisher identity exists outside this bundle');
  const before=await client.query('SELECT (SELECT count(*) FROM learning_progress)::int AS legacy_progress,(SELECT count(*) FROM learning_notes)::int AS notes,(SELECT count(*) FROM atomic_progress)::int AS atomic_progress,(SELECT count(*) FROM atomic_task_submissions)::int AS tasks');
  if(!apply&&!dryRun){await client.query('ROLLBACK');return {planned:true,atoms:30,courses:1,attachments:bundle.media.length,learnerRecordsWritten:0};}
  await client.query("INSERT INTO users(id,username,display_name,status) VALUES($1,$2,$3,'disabled')",[bundle.publisher.id,bundle.publisher.username,bundle.publisher.displayName]);
  const knowledgeCreated=[];
  // Reverse insertion retains the public catalog order with actual import timestamps.
  const ordered=[...bundle.nodes.filter(n=>n.kind==='teaching')].reverse().concat(bundle.nodes.filter(n=>n.kind==='course'));
  for(const n of ordered){
   await client.query('INSERT INTO atomic_nodes(id,kind,owner_id,created_at) VALUES($1,$2,$3,clock_timestamp())',[n.id,n.kind,bundle.publisher.id]);
   await client.query("INSERT INTO atomic_versions(node_id,revision,payload,status) VALUES($1,1,$2::jsonb,'published')",[n.id,JSON.stringify(n.payload)]);
   await client.query('UPDATE atomic_nodes SET published_revision=1 WHERE id=$1',[n.id]);
   await client.query('INSERT INTO atomic_audit(id,node_id,revision,actor_id,action,note) VALUES($1,$2,1,$3,$4,$5)',[randomUUID(),n.id,bundle.publisher.id,'import_source',`平台所有者授权同步交接原稿。当前为大纲资料，不含课堂认证或示例学习进度。来源：${n.sourceUrl}`]);
   for(const label of n.payload.knowledge||[]){
    let found=await client.query("SELECT id FROM knowledge_nodes WHERE title=$1 AND status='published' ORDER BY id LIMIT 1",[label]);
    let id=found.rows[0]?.id;
    if(!id){id='morph-handoff-knowledge-'+digest(label).slice(0,20);await client.query("INSERT INTO knowledge_nodes(id,title,description,domain,status,source,created_by) VALUES($1,$2,$3,$4,'published','manual',$5)",[id,label,'来自 MORPH LAB 交接课程原稿的知识索引；不代表任何用户已掌握。',n.payload.direction||'设计方法',bundle.publisher.id]);knowledgeCreated.push(id);}
    await client.query('INSERT INTO atomic_knowledge_bindings(atom_id,revision,knowledge_node_id,created_by) VALUES($1,1,$2,$3)',[n.id,id,bundle.publisher.id]);
   }
  }
  for(const a of bundle.media){
   if(!dryRun){
    if(!uploadRoot||!path.isAbsolute(uploadRoot))throw Error('Explicit absolute upload root required');
    const target=path.resolve(uploadRoot,a.storageKey);if(!target.startsWith(path.resolve(uploadRoot)+path.sep))throw Error('Asset escaped upload root');
    const bytes=await readFile(path.join(root,'seed/atomic-handoff/media',a.filename));await mkdir(path.dirname(target),{recursive:true,mode:0o700});
    try{await writeFile(target,bytes,{flag:'wx',mode:0o600});}catch(error){if(error.code!=='EEXIST'||digest(await readFile(target))!==a.sha256)throw error;}
   }
   await client.query('INSERT INTO atomic_assets(id,node_id,storage_key,file_name,mime_type,size_bytes) VALUES($1,$2,$3,$4,$5,$6)',[a.id,a.nodeId,a.storageKey,a.fileName,a.mimeType,a.size]);
  }
  const after=await client.query('SELECT (SELECT count(*) FROM learning_progress)::int AS legacy_progress,(SELECT count(*) FROM learning_notes)::int AS notes,(SELECT count(*) FROM atomic_progress)::int AS atomic_progress,(SELECT count(*) FROM atomic_task_submissions)::int AS tasks');
  if(JSON.stringify(before.rows[0])!==JSON.stringify(after.rows[0]))throw Error('Importer changed learner records');
  await client.query('INSERT INTO content_bundle_installs(id,checksum,snapshot_json) VALUES($1,$2,$3::jsonb)',[bundle.id,checksum,JSON.stringify({nodeIds:bundle.nodes.map(n=>n.id),knowledgeCreated,assetIds:bundle.media.map(a=>a.id),publisherId:bundle.publisher.id,source:bundle.source})]);
  await client.query(dryRun?'ROLLBACK':'COMMIT');
  return {dryRun,installed:!dryRun,atoms:30,courses:1,attachments:bundle.media.length,knowledgeCreated:knowledgeCreated.length,learnerRecordsWritten:0};
 }catch(error){await client.query('ROLLBACK');throw error;}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const {bundle,checksum}=await readAtomicHandoff();
 if(process.argv.includes('--verify'))console.log(JSON.stringify({verified:true,checksum,nodes:bundle.nodes.length}));
 else {const pool=new pg.Pool({connectionString:process.env.DATABASE_URL}),client=await pool.connect();try{console.log(JSON.stringify(await installAtomicHandoff(client,bundle,checksum,{apply:process.argv.includes('--apply'),dryRun:process.argv.includes('--dry-run'),uploadRoot:process.env.UPLOAD_ROOT})));}finally{client.release();await pool.end();}}
}
