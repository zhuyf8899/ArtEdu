/** Run from apps/api after db:migrate and build. Media are supplied separately from Git. */
import 'dotenv/config';
import pg from 'pg';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { installFile } from './install-community-showcase.mjs';

const [directory, mode = '--plan'] = process.argv.slice(2);
if (!directory || !['--plan', '--apply'].includes(mode)) throw Error('Expected prepared bundle directory and --plan or --apply');
const checksum = value => createHash('sha256').update(value).digest('hex');
const bundle = JSON.parse(await readFile(path.join(directory, 'manifest.json'), 'utf8'));
const hash = checksum(JSON.stringify(bundle));
if (hash !== '6fa1827968a9c8046cd4b4fd3fe92067a1dd78cff4b19729b7c68193050abb73') throw Error('Manifest differs from reviewed November pilot');
const require = createRequire(import.meta.url);
const { atomPayload, coursePayload } = require('../dist/modules/atomic/atomic.contracts.js');
const { caseStorySchema, assertCasePublication } = require('../dist/modules/studio/case-story.js');
const { work, nodes, tool } = bundle;
const teacher = 'morph-november-exhibition-credit';
const library = 'morph-november-library';
const storageRoot = path.resolve(process.env.UPLOAD_ROOT || 'data/uploads');
const mediaSource = a => path.join(directory, 'media', a.sha256);
const storageKey = a => `users/${library}/works/${work.id}/${a.id}-${a.id}`;
for (const a of work.assets) {
  const bytes = await readFile(mediaSource(a));
  if (bytes.length !== a.bytes || checksum(bytes) !== a.sha256) throw Error('Invalid asset: ' + a.name);
}
for (const n of nodes) (n.kind === 'course' ? coursePayload : atomPayload).parse(n.payload);
const story = caseStorySchema.parse({ origin: 'platform', sourceName: 'MORPH LAB', creators: [work.author],
  tools: [tool.title], coverAssetId: work.assets.find(a => a.cover).id });
assertCasePublication(story);

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query('BEGIN');
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [bundle.id]);
  const journal = (await client.query('SELECT checksum,rolled_back_at FROM content_bundle_installs WHERE id=$1', [bundle.id])).rows[0];
  if (journal && (journal.checksum !== hash || journal.rolled_back_at)) throw Error('Installation journal conflict');
  if (journal) {
    // Restore missing media only for records still referencing the imported bytes.
    const current = await client.query('SELECT id,storage_key,sha256 FROM work_assets WHERE work_id=$1', [work.id]);
    let restored = 0;
    if (mode === '--apply') for (const a of work.assets) {
      if (current.rows.some(r => r.id === a.id && r.sha256 === a.sha256 && r.storage_key === storageKey(a)))
        restored += Number(await installFile(mediaSource(a), path.join(storageRoot, storageKey(a)), a.sha256));
    }
    console.log(JSON.stringify({ alreadyInstalled: true, restored }));
  } else {
    const conflicts = await client.query(`SELECT id FROM works WHERE id=$1 OR title=$2
      UNION ALL SELECT id FROM tool_directory_links WHERE id=$3 OR lower(name)=lower($4)
      UNION ALL SELECT n.id FROM atomic_nodes n JOIN atomic_versions v ON v.node_id=n.id
      WHERE n.id=ANY($5) OR v.payload->>'title'=ANY($6)
      UNION ALL SELECT id FROM users WHERE id=ANY($7) OR username=ANY($7)`,
      [work.id,work.title,tool.id,tool.title,nodes.map(n=>n.id),nodes.map(n=>n.payload.title),[library,teacher]]);
    if (conflicts.rowCount) throw Error('Existing content requires mapping: ' + conflicts.rows.map(r=>r.id).join(', '));
    // The plan executes the same INSERTs and constraint checks, then rolls back.
    for (const [id,name] of [[teacher,bundle.teacher],[library,'MORPH LAB 教学资料库']])
      await client.query("INSERT INTO users(id,username,display_name,status) VALUES($1,$1,$2,'disabled')",[id,name]);
    for (const n of nodes) {
      await client.query('INSERT INTO atomic_nodes(id,kind,owner_id) VALUES($1,$2,$3)',[n.id,n.kind,teacher]);
      await client.query("INSERT INTO atomic_versions(node_id,revision,payload,status) VALUES($1,1,$2,'published')",[n.id,n.payload]);
      await client.query('UPDATE atomic_nodes SET published_revision=1 WHERE id=$1',[n.id]);
      await client.query('INSERT INTO atomic_audit(id,node_id,revision,actor_id,action,note) VALUES($1,$2,1,$3,$4,$5)',
        [randomUUID(),n.id,library,'import_source',bundle.id]);
      if (n.kind === 'teaching') {
        const knowledgeId = n.id + '-knowledge';
        await client.query("INSERT INTO knowledge_nodes(id,title,description,domain,status,source,created_by) VALUES($1,$2,$3,$4,'published','manual',$5)",
          [knowledgeId,n.payload.title,n.payload.summary,n.payload.direction,library]);
        await client.query('INSERT INTO atomic_knowledge_bindings(atom_id,revision,knowledge_node_id,created_by) VALUES($1,1,$2,$3)',[n.id,knowledgeId,library]);
      }
    }
    await client.query(`INSERT INTO tool_directory_links(id,category,name,detail,href,icon_key,cover_image_url,catalog_json)
      VALUES($1,$2,$3,$4,$5,'ai','/morph-november/gemus.svg',$6)`,
      [tool.id,tool.type,tool.title,tool.desc,tool.officialUrl,{tags:tool.tags,subtitle:tool.subtitle,stage:tool.stage,
       relatedAtoms:nodes.filter(n=>n.payload.tools?.includes(tool.title)).map(n=>({id:n.id,title:n.payload.title})),
       relatedWorks:[{id:work.id,title:work.title}]}]);
    await client.query("INSERT INTO works(id,author_id,title,summary,discipline,status,published_at,story_json) VALUES($1,$2,$3,$4,$5,'approved',CURRENT_TIMESTAMP,$6)",
      [work.id,library,work.title,work.summary,work.category,story]);
    for (const tag of work.tags) {
      const slug = 'morph-tag-' + checksum(tag).slice(0,16);
      await client.query('INSERT INTO tags(id,name,slug) VALUES($1,$2,$1) ON CONFLICT(name) DO NOTHING',[slug,tag]);
      await client.query('INSERT INTO work_tags(work_id,tag_id) SELECT $1,id FROM tags WHERE name=$2',[work.id,tag]);
    }
    for (const a of work.assets) {
      // A leftover blob from a failed transaction is reusable only if its digest matches.
      if (mode === '--apply') await installFile(mediaSource(a),path.join(storageRoot,storageKey(a)),a.sha256);
      await client.query(`INSERT INTO work_assets(id,work_id,file_name,mime_type,storage_key,file_size,sha256,
        asset_type,alt_text,sort_order,moderation_status,preview_text) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'approved',$11)`,
        [a.id,work.id,a.name,a.mime,storageKey(a),a.bytes,a.sha256,a.type,a.title,a.cover?-1:a.order,a.preview||null]);
    }
    await client.query('INSERT INTO content_bundle_installs(id,checksum,snapshot_json) VALUES($1,$2,$3)',
      [bundle.id,hash,{nodeIds:nodes.map(n=>n.id),workId:work.id,toolId:tool.id}]);
    console.log(JSON.stringify({mode,nodes:nodes.length,assets:work.assets.length,work:work.id,tool:tool.id}));
  }
  await client.query(mode === '--apply' ? 'COMMIT' : 'ROLLBACK');
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  await client.end();
}
