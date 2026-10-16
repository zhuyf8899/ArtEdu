/** Narrow, journaled editorial revision. The installed v1 manifest stays immutable. */
import 'dotenv/config';
import pg from 'pg';
import {createHash,randomUUID} from 'node:crypto';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export async function readToolCopy(base) {
  const revision=JSON.parse(await readFile(path.join(root,'seed/morph-catalog/tool-copy-v2.json'),'utf8'));
  if(revision.id!=='morph-tool-copy-v2'||revision.version!==2||revision.tools?.length!==19)throw new Error('Invalid tool copy revision');
  if(new Set(revision.tools.map(t=>t.id)).size!==19)throw new Error('Duplicate tool copy IDs');
  for(const t of revision.tools){const original=base.tools.find(b=>b.id===t.id);if(!original||original.name!==t.name||!t.subtitle||!t.detail||Object.keys(t).some(k=>!['id','name','subtitle','detail'].includes(k)))throw new Error('Tool copy revision exceeds its approved field scope');}
  return {revision,checksum:digest(revision)};
}
export async function planToolCopy(client,base,revision,checksum) {
  const installed=(await client.query('SELECT * FROM content_bundle_installs WHERE id=$1',[revision.id])).rows[0];
  if(installed){if(installed.checksum!==checksum||installed.rolled_back_at)throw new Error('Copy revision changed or rolled back; use a new version');return {alreadyInstalled:true,id:revision.id};}
  const foundation=(await client.query('SELECT * FROM content_bundle_installs WHERE id=$1',[base.id])).rows[0];
  if(!foundation||foundation.rolled_back_at||foundation.checksum!==digest(base))throw new Error('Install the matching base catalog before revising copy');
  const {rows}=await client.query('SELECT *,updated_at::text AS original_updated_at FROM tool_directory_links WHERE id=ANY($1::text[]) ORDER BY id',[revision.tools.map(t=>t.id)]);
  if(rows.length!==19)throw new Error('Missing tool rows; refusing partial revision');
  for(const row of rows){const original=base.tools.find(t=>t.id===row.id);
    if(row.catalog_json?.bundleId!==base.id||row.name!==original.name||row.detail!==original.detail||row.catalog_json.detail!==original.detail||row.href!==original.href||row.category!==original.category||row.cover_image_url!==original.coverUrl||row.status!=='active'||row.catalog_json.subtitle!==undefined)throw new Error('Tool was edited after import; manual copy review required: '+row.id);
  }
  return {alreadyInstalled:false,id:revision.id,rows,tools:rows.length};
}
export async function applyToolCopy(client,base,revision,checksum,backupWriter) {
  await client.query('BEGIN');
  try{await client.query('SELECT pg_advisory_xact_lock(7410637)');
    // Lock targets before comparing snapshots, not just before the eventual UPDATE.
    await client.query('SELECT id FROM tool_directory_links WHERE id=ANY($1::text[]) FOR UPDATE',[revision.tools.map(t=>t.id)]);
    const plan=await planToolCopy(client,base,revision,checksum);
    if(plan.alreadyInstalled){await client.query('COMMIT');return plan;}
    const rows=plan.rows.map(row=>({id:row.id,detail:row.detail,catalog_json:row.catalog_json,updated_at:row.original_updated_at}));
    await backupWriter({id:revision.id,checksum,tools:rows});
    for(const t of revision.tools)await client.query(`UPDATE tool_directory_links SET detail=$2,catalog_json=catalog_json||$3::jsonb,updated_at=CURRENT_TIMESTAMP WHERE id=$1`,[t.id,t.detail,JSON.stringify({detail:t.detail,subtitle:t.subtitle,copyRevision:revision.id})]);
    const after=(await client.query('SELECT id,detail,catalog_json,updated_at::text AS updated_at FROM tool_directory_links WHERE id=ANY($1::text[]) ORDER BY id',[revision.tools.map(t=>t.id)])).rows;
    await client.query('INSERT INTO content_bundle_installs(id,checksum,snapshot_json) VALUES($1,$2,$3::jsonb)',[revision.id,checksum,JSON.stringify({kind:'tool-copy',tools:rows,after})]);
    await client.query('COMMIT');return {id:revision.id,tools:19,personalHistoryPreserved:true};
  }catch(error){await client.query('ROLLBACK');throw error;}
}
export async function rollbackToolCopy(client,id) {
  await client.query('BEGIN');
  try{await client.query('SELECT pg_advisory_xact_lock(7410637)');
    const install=(await client.query('SELECT * FROM content_bundle_installs WHERE id=$1 FOR UPDATE',[id])).rows[0];
    if(!install||install.rolled_back_at||install.snapshot_json?.kind!=='tool-copy')throw new Error('No active copy revision to restore');
    const snapshot=install.snapshot_json;
    await client.query('SELECT id FROM tool_directory_links WHERE id=ANY($1::text[]) FOR UPDATE',[snapshot.tools.map(t=>t.id)]);
    const current=(await client.query('SELECT id,detail,catalog_json,updated_at::text AS updated_at FROM tool_directory_links WHERE id=ANY($1::text[]) ORDER BY id',[snapshot.tools.map(t=>t.id)])).rows;
    // JSONB normalizes object key order; compare values rather than serialized property order.
    if(!isDeepStrictEqual(current,snapshot.after))throw new Error('Tool changed after copy revision; manual rollback review required');
    for(const row of snapshot.tools)await client.query('UPDATE tool_directory_links SET detail=$2,catalog_json=$3::jsonb,updated_at=$4::timestamptz WHERE id=$1',[row.id,row.detail,JSON.stringify(row.catalog_json),row.updated_at]);
    await client.query('UPDATE content_bundle_installs SET rolled_back_at=CURRENT_TIMESTAMP WHERE id=$1',[id]);
    await client.query('COMMIT');return {id,rolledBack:true};
  }catch(error){await client.query('ROLLBACK');throw error;}
}
export async function writeToolCopyBackup(snapshot) {
  const dir=path.join(root,'apps/api/data/catalog-backups');await mkdir(dir,{recursive:true});
  const target=path.join(dir,`${snapshot.id}-${randomUUID()}.json`);
  await writeFile(target,JSON.stringify(snapshot,null,2),{flag:'wx',mode:0o600});
  console.log('Tool copy backup saved:',path.relative(root,target));
}
async function main(){
  const {readCatalog}=await import('./install-morph-catalog.mjs');const {bundle}=await readCatalog();const {revision,checksum}=await readToolCopy(bundle);
  const mode=process.argv[2]||'--plan';if(!['--verify','--plan','--apply','--rollback'].includes(mode))throw new Error('Invalid copy revision command');
  if(mode==='--verify'){console.log({id:revision.id,tools:19,checksum});return;}
  if(!process.env.DATABASE_URL)throw new Error('Run from apps/api with DATABASE_URL configured');
  const client=new pg.Client({connectionString:process.env.DATABASE_URL});await client.connect();
  try{console.log(mode==='--rollback'?await rollbackToolCopy(client,revision.id):mode==='--apply'?await applyToolCopy(client,bundle,revision,checksum,writeToolCopyBackup):await planToolCopy(client,bundle,revision,checksum).then(({rows,...plan})=>plan));}finally{await client.end();}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{console.error(error.message);process.exitCode=1;});
