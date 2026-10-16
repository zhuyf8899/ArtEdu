import 'dotenv/config';
import pg from 'pg';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {readCatalog} from './install-morph-catalog.mjs';
import {readToolCopy,rollbackToolCopy} from './revise-morph-tool-copy.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const baseline=path.join(root,'apps/api/data/catalog-backups/personal-history-baseline.json');
const client=new pg.Client({connectionString:process.env.DATABASE_URL});await client.connect();
try {
  const fingerprints={};
  // Fixed local table names, never interpolated user input. Hashes only: no
  // names, notes, passwords, tokens or media contents in the verification log.
  for(const table of ['course_enrollments','learning_progress','learning_notes','learning_tasks','course_lesson_submissions','works','work_assets','workflow_runs']) {
    const {rows}=await client.query(`SELECT COUNT(*)::int AS count,md5(COALESCE(string_agg(row_to_json(t)::text,'' ORDER BY row_to_json(t)::text),'')) AS digest FROM ${table} t`);
    fingerprints[table]=rows[0];
  }
  if(process.argv[2]==='--baseline') {
    await mkdir(path.dirname(baseline),{recursive:true});await writeFile(baseline,JSON.stringify(fingerprints,null,2),{flag:'wx',mode:0o600});
    console.log('Personal history baseline saved (counts/digests only).');
  } else {
    assert.deepEqual(fingerprints,JSON.parse(await readFile(baseline,'utf8')),'Personal history changed; investigate before claiming preservation');
    const {rows}=await client.query(`SELECT (SELECT COUNT(*) FROM courses WHERE status='published' AND catalog_json->>'bundleId'='morph-catalog-v1')::int AS courses,
      (SELECT COUNT(*) FROM course_lessons WHERE course_id LIKE 'morph-course-%' AND status='published')::int AS lessons,
      (SELECT COUNT(*) FROM tool_directory_links WHERE status='active' AND catalog_json->>'bundleId'='morph-catalog-v1')::int AS tools,
      (SELECT COUNT(*) FROM works WHERE status='approved')::int AS published_cases`);
    assert.equal(rows[0].courses,13);assert.equal(rows[0].lessons,9);assert.equal(rows[0].tools,19);
    const {bundle}=await readCatalog();const {revision}=await readToolCopy(bundle);
    const tools=(await client.query("SELECT id,name,detail,catalog_json FROM tool_directory_links WHERE catalog_json->>'bundleId'=$1",[bundle.id])).rows;
    for(const expected of revision.tools){const actual=tools.find(t=>t.id===expected.id);assert.equal(actual?.name,expected.name);assert.equal(actual?.detail,expected.detail);assert.equal(actual?.catalog_json.subtitle,expected.subtitle);}
    const courses=(await client.query("SELECT id,title,summary,category,difficulty,estimated_minutes,cover_url FROM courses WHERE catalog_json->>'bundleId'=$1",[bundle.id])).rows;
    for(const expected of bundle.courses){const actual=courses.find(c=>c.id===expected.id);assert.equal(actual?.title,expected.title);assert.equal(actual?.summary,expected.summary);assert.equal(actual?.category,expected.category);assert.equal(actual?.difficulty,expected.difficulty);assert.equal(actual?.estimated_minutes,expected.estimatedMinutes);assert.equal(actual?.cover_url,expected.coverUrl);}
    let copyRollbackVerified=false;
    if(process.argv.includes('--copy-rollback-check')) {
      const databaseHost=new URL(process.env.DATABASE_URL).hostname;
      if(!['localhost','127.0.0.1','[::1]'].includes(databaseHost))throw new Error('Rollback verification is local-only');
      await client.query('BEGIN');
      try {
        const nested={query:(sql,values)=>client.query(sql==='BEGIN'?'SAVEPOINT copy_qa':sql==='COMMIT'?'RELEASE SAVEPOINT copy_qa':sql==='ROLLBACK'?'ROLLBACK TO SAVEPOINT copy_qa':sql,values)};
        await rollbackToolCopy(nested,revision.id);
        const restored=(await client.query('SELECT id,detail FROM tool_directory_links WHERE id=ANY($1::text[])',[bundle.tools.map(t=>t.id)])).rows;
        for(const t of bundle.tools)assert.equal(restored.find(r=>r.id===t.id)?.detail,t.detail);
        copyRollbackVerified=true;
      }finally{await client.query('ROLLBACK');}
      const installed=(await client.query('SELECT rolled_back_at FROM content_bundle_installs WHERE id=$1',[revision.id])).rows[0];
      assert.equal(installed.rolled_back_at,null);
    }
    console.log({catalog:rows[0],courseMetadataMatched:13,toolCopyMatched:19,personalHistoryUnchanged:true,copyRollbackVerified});
  }
}finally{await client.end();}
