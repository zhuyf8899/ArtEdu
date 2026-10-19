/** Explicit, reversible copy revision; never recreates cases or changes moderation/media. */
import 'dotenv/config';
import assert from 'node:assert/strict';
import pg from 'pg';
import {createHash, randomUUID} from 'node:crypto';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const checksum = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const revision = JSON.parse(await readFile(path.join(root, 'seed/cvpr-featured-copy-v1.json'), 'utf8'));
assert.equal(revision.works.length, 9);
assert.equal(new Set(revision.works.map(w => w.originalUrl)).size, 9);
for (const work of revision.works) {
  assert.equal(new URL(work.originalUrl).hostname, 'thecvf-art.com');
  assert.ok(work.summary.length > 300 && work.summary.length < 4000);
}
const hash = checksum(revision);
const mode = process.argv[2] || '--plan';
assert.ok(['--plan', '--apply', '--rollback', '--verify'].includes(mode));
if (mode === '--verify') { console.log({id: revision.id, cases: 9, checksum: hash}); process.exit(0); }
assert.ok(process.env.DATABASE_URL, 'Run from apps/api with DATABASE_URL configured');
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(new URL(process.env.DATABASE_URL).hostname), 'Local content revision only');
const db = new pg.Client({connectionString: process.env.DATABASE_URL});
const backupDir = path.join(root, 'apps/api/data/catalog-backups');
const select = `SELECT *,updated_at::text AS original_updated_at FROM works WHERE story_json->>'originalUrl'=ANY($1::text[]) ORDER BY id`;
const urls = revision.works.flatMap(w => [w.originalUrl, ...(w.previousUrl ? [w.previousUrl] : [])]);
// Normalize pg Date instances exactly as they are persisted in plans/journals.
const readRows = async () => JSON.parse(JSON.stringify((await db.query(select, [urls])).rows));
const validate = rows => {
  assert.equal(rows.length, 9, 'All nine existing cases must be installed; refusing partial revision');
  for (const work of revision.works) {
    const matches = rows.filter(row => [work.originalUrl, work.previousUrl].includes(row.story_json?.originalUrl));
    assert.equal(matches.length, 1, 'Missing/duplicate source: ' + work.title);
    const row = matches[0];
    assert.equal(row.title, work.title);
    assert.equal(row.status, 'approved');
    assert.equal(row.story_json.collection, 'art-selection');
    assert.equal(row.story_json.authorization, 'confirmed');
  }
};
await db.connect();
try {
  if (mode === '--plan') {
    const rows = await readRows(); validate(rows);
    await mkdir(backupDir, {recursive: true});
    const file = path.join(backupDir, `${revision.id}-plan-${randomUUID()}.json`);
    await writeFile(file, JSON.stringify({id: revision.id, checksum: hash, rows}, null, 2), {flag: 'wx', mode: 0o600});
    console.log(JSON.stringify({mode, planFile: file, cases: rows.map(row => ({title: row.title, before: row.summary.length, after: revision.works.find(w => [w.originalUrl,w.previousUrl].includes(row.story_json.originalUrl)).summary.length}))}, null, 2));
  } else {
    await db.query('BEGIN');
    try {
      await db.query('SELECT pg_advisory_xact_lock(7410638)');
      await db.query(`SELECT id FROM works WHERE story_json->>'originalUrl'=ANY($1::text[]) FOR UPDATE`, [urls]);
      const current = await readRows(); validate(current);
      const install = (await db.query('SELECT * FROM content_bundle_installs WHERE id=$1 FOR UPDATE', [revision.id])).rows[0];
      if (mode === '--rollback') {
        assert.ok(install && !install.rolled_back_at && install.checksum === hash, 'No matching active revision');
        assert.ok(isDeepStrictEqual(current, install.snapshot_json.after), 'Case edited since revision; manual rollback review required');
        for (const row of install.snapshot_json.before) await db.query('UPDATE works SET summary=$2,story_json=$3::jsonb,updated_at=$4::timestamptz WHERE id=$1', [row.id,row.summary,JSON.stringify(row.story_json),row.original_updated_at]);
        await db.query('UPDATE content_bundle_installs SET rolled_back_at=CURRENT_TIMESTAMP WHERE id=$1', [revision.id]);
      } else if (install) {
        assert.ok(!install.rolled_back_at && install.checksum === hash && isDeepStrictEqual(current,install.snapshot_json.after), 'Revision/targets changed; review required');
      } else {
        assert.ok(process.argv[3], 'Apply requires an inspected --plan JSON path');
        const plan = JSON.parse(await readFile(path.resolve(process.argv[3]), 'utf8'));
        assert.equal(plan.id, revision.id); assert.equal(plan.checksum, hash);
        assert.ok(isDeepStrictEqual(plan.rows, current), 'Case changed after plan; regenerate and inspect plan');
        await mkdir(backupDir, {recursive:true});
        await writeFile(path.join(backupDir,`${revision.id}-before-${randomUUID()}.json`),JSON.stringify(plan,null,2),{flag:'wx',mode:0o600});
        for (const work of revision.works) {
          const row = current.find(row => [work.originalUrl,work.previousUrl].includes(row.story_json.originalUrl));
          // Only the public introduction and its original-work link are revised.
          await db.query(`UPDATE works SET summary=$2,story_json=jsonb_set(story_json,'{originalUrl}',to_jsonb($3::text)),updated_at=CURRENT_TIMESTAMP WHERE id=$1`,[row.id,work.summary,work.originalUrl]);
        }
        const after = await readRows();
        await db.query('INSERT INTO content_bundle_installs(id,checksum,snapshot_json) VALUES($1,$2,$3::jsonb)',[revision.id,hash,JSON.stringify({kind:'authorized-cvpr-editorial-revision',sourceCheckedAt:revision.sourceCheckedAt,before:current,after})]);
      }
      await db.query('COMMIT'); console.log({id:revision.id,cases:9,mode,mediaAndLearningUntouched:true});
    } catch (error) { await db.query('ROLLBACK'); throw error; }
  }
} finally { await db.end(); }
