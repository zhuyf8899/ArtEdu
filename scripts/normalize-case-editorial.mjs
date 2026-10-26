// Explicit --apply is required. Back up originals and update in one transaction; no source assets are removed.
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
const require=createRequire(new URL('../apps/api/package.json',import.meta.url));
require('dotenv').config({path:fileURLToPath(new URL('../apps/api/.env',import.meta.url)),quiet:true});
const {separateEditorialText}=require('./dist/modules/studio/case-editorial.js');
const pool=new (require('pg').Pool)({connectionString:process.env.DATABASE_URL});
const client=await pool.connect();
try{
 const result=await client.query('SELECT id,title,summary,story_json,updated_at,updated_at::text AS original_revision FROM works ORDER BY id');
 const changed=[];
 for(const work of result.rows){
  const story=structuredClone(work.story_json||{}),notes=[];
  const summary=separateEditorialText(work.summary||'');if(summary.notes)notes.push('项目简介：'+summary.notes);
  const reflection=separateEditorialText(story.reflection||'');if(reflection.notes)notes.push('经验与反思：'+reflection.notes);story.reflection=reflection.text;
  story.steps=(story.steps||[]).map(step=>{for(const key of ['description','outcome']){const split=separateEditorialText(step[key]||'');if(split.notes){notes.push(step.title+'：'+split.notes);step={...step,[key]:split.text};}}return step;});
  story.creators=(story.creators||[]).map(name=>{const clean=name.replace(/[（(]其余团队成员署名待补充[）)]/g,'').trim();if(clean!==name)notes.push('署名备注：'+name);return clean;}).filter(Boolean);
  if(!notes.length)continue;
  story.editorialNote=[story.editorialNote,...notes].filter(Boolean).join('\n\n');
  if(story.editorialNote.length>8000)throw Error('编辑备注超长，需人工整理：'+work.id);
  changed.push({original:work,summary:summary.text,story});
 }
 console.log(JSON.stringify({mode:process.argv.includes('--apply')?'apply':'plan',scanned:result.rows.length,changes:changed.map(c=>({id:c.original.id,title:c.original.title}))}));
 if(process.argv.includes('--apply')&&changed.length){
  const root=fileURLToPath(new URL('../apps/api/data/backups/',import.meta.url));await mkdir(root,{recursive:true});
  const backup=path.join(root,'case-editorial-'+Date.now()+'.json');await writeFile(backup,JSON.stringify(changed.map(c=>c.original),null,2));
  await client.query('BEGIN');
  for(const change of changed){const r=await client.query('UPDATE works SET summary=$2,story_json=$3,updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND updated_at::text=$4',[change.original.id,change.summary,JSON.stringify(change.story),change.original.original_revision]);if(r.rowCount!==1)throw Error('内容在整理期间已变化，全部回滚');}
  await client.query('COMMIT');console.log('已备份并将整理说明移入内部备注：'+backup);
 }
}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();await pool.end();}
