// Local-only, repeatable import. External works stay drafts with permission pending.
import 'dotenv/config';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import pg from 'pg';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const require=createRequire(import.meta.url);
const {workInputSchema}=require('../dist/modules/studio/studio.contracts.js');
const manifest=JSON.parse(await readFile(path.join(root,'seed/cvpr-art-2026/cases.json'),'utf8'));
const prepared=manifest.cases.map(item=>{
 const source=`https://thecvf-art.com/project.php?artist=${encodeURIComponent(item.artist)}&id=${item.id}&year=2026`;
 const payload=workInputSchema.parse({title:item.title,summary:item.summary,discipline:item.discipline,tagNames:['CVPR Art 2026',...item.methods],story:{version:1,origin:'collected',creators:item.creators,tools:item.tools,methods:item.methods,authorization:'pending',authorizationNote:'公开展览页面可访问；未取得平台转载展示授权。原站保留版权。仅整理中文导读和外部资料链接。',reflection:item.question,steps:[{title:'作品方法导读',description:item.process},{title:'原始资料',description:`来源：${source}\n整理日期：${manifest.reviewedAt}。中文内容为编辑导读，非作者原文或完整复现教程；未公开的提示词及参数不补造。`} ]}});
 const links=[{label:'原作图文与视频页面',url:source},...item.links];
 for(const link of links){const u=new URL(link.url);if(u.protocol!=='https:'||u.username||u.password)throw new Error('Invalid source URL');}
 return {id:`work-cvpr2026-${item.key}`,payload,links};
});
if(new Set(prepared.map(x=>x.id)).size!==prepared.length)throw new Error('Duplicate case IDs');
console.log(JSON.stringify({cases:prepared.length,links:prepared.reduce((n,c)=>n+c.links.length,0),mode:process.argv.includes('--apply')?'local-drafts':'dry-run'}));
if(process.argv.includes('--apply')){
 const target=new URL(process.env.DATABASE_URL);
 if(!['localhost','127.0.0.1','[::1]'].includes(target.hostname))throw new Error('This importer only writes to a local database');
 const client=new pg.Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:5000});
 await client.connect();
 let created=0;
 try{
  await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(7410626)');
  const author=await client.query("SELECT id FROM users WHERE username='admin.demo' AND status='active'");
  if(author.rowCount!==1)throw new Error('Expected active admin.demo account');
  for(const entry of prepared){
   const existing=await client.query('SELECT id,title,author_id,status FROM works WHERE id=$1 OR title=$2',[entry.id,entry.payload.title]);
   if(existing.rowCount){if(existing.rowCount!==1||existing.rows[0].id!==entry.id||existing.rows[0].author_id!==author.rows[0].id||existing.rows[0].title!==entry.payload.title)throw new Error('Conflicting existing case');continue;}
   await client.query("INSERT INTO works(id,author_id,title,summary,discipline,status,story_json) VALUES($1,$2,$3,$4,$5,'draft',$6::jsonb)",[entry.id,author.rows[0].id,entry.payload.title,entry.payload.summary,entry.payload.discipline,JSON.stringify(entry.payload.story)]);
   for(const [index,link] of entry.links.entries())await client.query("INSERT INTO work_assets(id,work_id,file_name,mime_type,external_url,asset_type,alt_text,sort_order,moderation_status) VALUES($1,$2,$3,'text/html',$4,'other',$3,$5,'pending')",[`${entry.id}-source-${index}`,entry.id,link.label,link.url,index]);
   for(const name of entry.payload.tagNames){const slug=`cvpr2026-${Buffer.from(name).toString('hex')}`;await client.query('INSERT INTO tags(id,name,slug) VALUES($1,$2,$3) ON CONFLICT(name) DO NOTHING',[`tag-${slug}`,name,slug]);await client.query('INSERT INTO work_tags(work_id,tag_id) SELECT $1,id FROM tags WHERE name=$2 ON CONFLICT DO NOTHING',[entry.id,name]);}
   created++;
  }
  const rows=await client.query("SELECT id,title,status,story_json->>'authorization' AS authorization FROM works WHERE id=ANY($1::text[]) ORDER BY id",[prepared.map(x=>x.id)]);
  if(rows.rowCount!==prepared.length)throw new Error('Import count mismatch');
  await client.query('COMMIT');console.log(JSON.stringify({created,cases:rows.rows},null,2));
 }catch(error){await client.query('ROLLBACK');throw error;}finally{await client.end();}
}
