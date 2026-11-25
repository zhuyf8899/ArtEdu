/** Install after the November pilot. --plan validates using a rolled-back transaction. */
import 'dotenv/config';
import pg from 'pg';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {installFile} from './install-community-showcase.mjs';

const [dir,mode='--plan']=process.argv.slice(2);
if (!dir || !['--plan','--apply'].includes(mode)) throw Error('Expected bundle directory and --plan or --apply');
const apply=mode==='--apply', hash=data=>createHash('sha256').update(data).digest('hex');
const raw=await readFile(path.join(dir,'catalog.json')), checksum=hash(raw);
if(checksum!=='1eb079d799b20b2b825e7d677331afcc222adef2229688dccd93fccb08ca46bf')throw Error('Unexpected release or damaged manifest');
const catalog=JSON.parse(raw), apiRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const uploadRoot=path.resolve(process.env.UPLOAD_ROOT||path.join(apiRoot,'data/uploads'));
const publicRoot=path.resolve(apiRoot,'../../admin-console/public/morph-november/catalog');
const require=createRequire(import.meta.url);
const {atomPayload,coursePayload}=require('../dist/modules/atomic/atomic.contracts.js');
const {caseStorySchema}=require('../dist/modules/studio/case-story.js');
const {assertCaseEditorial}=require('../dist/modules/studio/case-editorial.js');
const library='morph-november-library', pilot='morph-november-20261119-pilot-v1';
const mappedWorks={
 'case-misthill':'work-442627ce-0bc5-47c6-96ed-c80cd0015f4b','case-elephant':'work-91a7a847-3c8f-46cf-bf1c-56e095bc708a',
 'case-essenza':'work-77d4e707-c163-4aab-9c71-056dc31f24b1','case-zhulong':'work-1573e353-3626-4fe9-9137-ed9cde87f047',
 'case-congbian':'work-6279eb9b-4eb5-41a3-b75b-92dd2bb0e042','case-yingque':'work-763623bc-75e4-4e55-8920-94f00e1f7dd8',
 'case-liannian':'work-52815e54-8eb4-4f63-8d1d-9f57c6aee132','case-sunwing':'work-83a2ce9f-043d-4f7e-9372-c3685f6c923d',
 'case-mirror':'work-e922c1f0-a526-45ab-8a54-7fe48b43801f'
};
const toolsByKey=new Map(catalog.tools.map(t=>[t.key,t]));
const old=JSON.parse(await readFile(path.resolve(apiRoot,'../../seed/morph-catalog/manifest.json')));
const mappedTools=new Map(old.tools.map(t=>[t.name,t.id]));
mappedTools.set('数字影箱','tool-directory-piying');
mappedTools.set('Gemus','morph-tool-gemus');
const files=new Map();
for(const item of [...catalog.nodes,...catalog.works])for(const a of item.assets) files.set(a.sha256,a.size);
for(const [sum,size] of files){
 const bytes=await readFile(path.join(dir,'media',sum));
 if(bytes.length!==size||hash(bytes)!==sum)throw Error('Invalid media '+sum);
}
for(const [key,sum] of Object.entries(catalog.illustrationHashes)){
 const source=path.join(dir,'illustrations',key);
 if(hash(await readFile(source))!==sum)throw Error('Invalid illustration '+key);
 if(apply)await installFile(source,path.join(publicRoot,key),sum);
}
const client=new pg.Client({connectionString:process.env.DATABASE_URL});
await client.connect();
const query=(sql,values)=>client.query(sql,values);
const rows=async(sql,values)=>(await query(sql,values)).rows;
const connections=new Map(catalog.tools.map(t=>[t.key,{relatedAtoms:[],relatedWorks:[]}]));
const counts={teaching:0,courses:0,newCases:0,updatedCaseSupplements:0,newTools:0,reusedTools:0,protectedTools:0};
async function node(id,kind,owner,payload){
 await query('INSERT INTO atomic_nodes(id,kind,owner_id) VALUES($1,$2,$3)',[id,kind,owner]);
 await query("INSERT INTO atomic_versions(node_id,revision,status,payload) VALUES($1,1,'published',$2)",[id,payload]);
 await query('UPDATE atomic_nodes SET published_revision=1 WHERE id=$1',[id]);
 await query('INSERT INTO atomic_audit(id,node_id,revision,actor_id,action,note) VALUES($1,$2,1,$3,$4,$5)',[randomUUID(),id,library,'import_source',catalog.id]);
}
async function copyAsset(asset,key){
 if(apply)await installFile(path.join(dir,'media',asset.sha256),path.join(uploadRoot,key),asset.sha256);
}
async function installNodes(){
 const owners=new Map(),groups=new Map();
 for(const n of catalog.nodes){
  for(const title of new Set([n.course,...n.usedIn].filter(Boolean))){
   if(!groups.has(title))groups.set(title,[]);
   groups.get(title).push(n);
  }
  const nodeTools=new Set(n.payload.tools);
  for(const t of catalog.tools){
   const linked=t.courseTitles.includes(n.payload.title) || (t.key==='gemus' && n.key==='submitted-054');
   if(linked){
    connections.get(t.key).relatedAtoms.push({id:n.id,title:n.payload.title});
    nodeTools.add(t.name);
   }
  }
  if(['submitted-054','submitted-055'].includes(n.key))continue;
  const owner='morph-credit-'+hash(n.teacher).slice(0,18);
  if(!owners.has(n.teacher)){
   await query("INSERT INTO users(id,username,display_name,status) VALUES($1,$1,$2,'disabled')",[owner,n.teacher]);
   owners.set(n.teacher,owner);
  }
  const payload=atomPayload.parse({...n.payload,tools:[...nodeTools],coverUrl:n.cover,...(n.outline?{readiness:'outline'}:{})});
  await node(n.id,'teaching',owner,payload);
  if(!n.outline){
   const kid=n.id+'-knowledge';
   await query("INSERT INTO knowledge_nodes(id,title,description,domain,status,source,created_by) VALUES($1,$2,$3,$4,'published','manual',$5)",[kid,payload.title,payload.summary,payload.direction,library]);
   await query('INSERT INTO atomic_knowledge_bindings(atom_id,revision,knowledge_node_id,created_by) VALUES($1,1,$2,$3)',[n.id,kid,library]);
  }
  for(const a of n.assets){
   const key='atomic/'+n.id+'/'+a.id;
   await copyAsset(a,key);
   await query('INSERT INTO atomic_assets(id,node_id,storage_key,file_name,mime_type,size_bytes) VALUES($1,$2,$3,$4,$5,$6)',[a.id,n.id,key,a.name,a.mime,a.size]);
  }
  counts.teaching++;
 }
 for(const [title,group] of groups){
  if(title==='展示设计研究与创新实践')continue;
  const onlyOutline=group.every(n=>n.outline);
  const payload=coursePayload.parse({title,coverUrl:group[0].cover,...(onlyOutline?{readiness:'outline'}:{}),
   summary:`《${title}》收录 ${group.length} 个教学节点。`+group.slice(0,3).map(n=>n.payload.title).join('、')+'。',
   steps:group.map(n=>({atomId:n.id,revision:1,required:onlyOutline||!n.outline,context:n.outline?'当前提供课程大纲。':''}))});
  await node('morph-nov-course-'+hash(title).slice(0,16),'course',library,payload);
  counts.courses++;
 }
}
async function installWorks(){
 connections.get('gemus').relatedWorks.push({id:'morph-nov-case-08',title:'中国居住图谱｜人口与住宅信息设计'});
 for(const w of catalog.works){
  const id=mappedWorks[w.key]||'morph-nov-'+w.key;
  const [existing]=await rows('SELECT id,title,status,author_id,story_json FROM works WHERE id=$1 FOR UPDATE',[id]);
  if(existing&&!mappedWorks[w.key])throw Error('Work ID already in use: '+id);
  if(existing && (existing.status!=='approved'||existing.author_id!=='user-student-demo'||existing.story_json?.blocks?.length||existing.story_json?.plates?.length))throw Error('Review existing case before applying: '+id);
  const owner=existing?.author_id||library;
  const relatedTools=w.tools.map(k=>{
   if(!toolsByKey.has(k))throw Error('Unknown tool '+k);
   connections.get(k).relatedWorks.push({id,title:existing?.title||w.title});
   return toolsByKey.get(k).name;
  });
  const previous=existing?.story_json;
  const story=caseStorySchema.parse({...(!existing?{origin:'platform',sourceName:'MORPH LAB',creators:w.creators,coverAssetId:w.cover,tools:relatedTools}:previous),
   ...(w.blocks.length?{blocks:w.blocks}:{}),...(w.plates.length?{plates:w.plates}:{})});
  if(!existing){
   assertCaseEditorial({title:w.title,summary:w.summary,story});
   const dup=await rows('SELECT id FROM works WHERE title=$1',[w.title]);if(dup.length)throw Error('Unmapped work: '+w.title);
   await query("INSERT INTO works(id,author_id,title,summary,discipline,status,published_at,story_json) VALUES($1,$2,$3,$4,$5,'approved',CURRENT_TIMESTAMP,$6)",[id,owner,w.title,w.summary,w.category,story]);
   for(const tag of w.tags){
    const slug='morph-tag-'+hash(tag).slice(0,16);
    await query('INSERT INTO tags(id,name,slug) VALUES($1,$2,$1) ON CONFLICT(name) DO NOTHING',[slug,tag]);
    await query('INSERT INTO work_tags(work_id,tag_id) SELECT $1,id FROM tags WHERE name=$2',[id,tag]);
   }
   counts.newCases++;
  }else{
   await query('UPDATE works SET story_json=$2 WHERE id=$1',[id,story]);
   counts.updatedCaseSupplements++;
  }
  for(const [i,a] of w.assets.entries()){
   const key=`users/${owner}/works/${id}/${a.id}-${a.id}`;
   await copyAsset(a,key);
   const order=existing?1000+i:a.id===w.cover?-1:i;
   await query(`INSERT INTO work_assets(id,work_id,file_name,mime_type,storage_key,file_size,sha256,asset_type,alt_text,sort_order,moderation_status,preview_text)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'approved',$11)`,[a.id,id,a.name,a.mime,key,a.size,a.sha256,a.type,a.title,order,a.preview||null]);
  }
 }
}
async function installTools(){
 for(const t of catalog.tools){
  const mapped=mappedTools.get(t.name), id=mapped||'morph-nov-tool-'+t.key.replace(':','-');
  const [existing]=await rows('SELECT id,updated_by,status FROM tool_directory_links WHERE id=$1 FOR UPDATE',[id]);
  const metadata={tags:t.tags,stage:t.stage,subtitle:t.subtitle,...connections.get(t.key)};
  if(existing){
   if(!mapped)throw Error('Tool ID conflict: '+id);
   if(existing.updated_by||existing.status!=='active'){counts.protectedTools++;continue;}
   await query("UPDATE tool_directory_links SET category=$2,name=$3,detail=$4,href=$5,cover_image_url=$6,catalog_json=catalog_json||$7::jsonb WHERE id=$1",
    [id,t.category,t.name,t.detail,t.href,t.cover,metadata]);
   counts.reusedTools++;
  }else{
   if((await rows("SELECT id FROM tool_directory_links WHERE lower(name)=lower($1) AND status='active'",[t.name])).length)throw Error('Unmapped tool: '+t.name);
   await query('INSERT INTO tool_directory_links(id,category,name,detail,href,cover_image_url,catalog_json) VALUES($1,$2,$3,$4,$5,$6,$7)',[id,t.category,t.name,t.detail,t.href,t.cover,metadata]);
   counts.newTools++;
  }
 }
}
async function installCaseLinks(){
 const edition=catalog.id+'-case-links';
 if((await rows('SELECT id FROM content_bundle_installs WHERE id=$1',[edition])).length)return;
 const records=[...catalog.works,{key:'case-08',related:['信息图形与可视化']}];
 let count=0;
 for(const work of records){
  const workId=mappedWorks[work.key]||'morph-nov-'+work.key;
  for(const title of new Set(work.related)){
   const matches=catalog.nodes.filter(n=>n.payload.title===title);
   if(matches.length!==1)throw Error('Ambiguous teaching reference: '+title);
   const result=await query(`INSERT INTO atomic_case_links (atom_id,work_id)
     SELECT n.id,w.id FROM atomic_nodes n CROSS JOIN works w WHERE n.id=$1 AND w.id=$2
     ON CONFLICT DO NOTHING`,[matches[0].id,workId]);
   count+=result.rowCount;
  }
 }
 await query('INSERT INTO content_bundle_installs(id,checksum,snapshot_json) VALUES($1,$2,$3)',[edition,checksum,{count}]);
}
async function sync(){
 await query('BEGIN');
 await query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[catalog.id]);
 const [installed]=await rows('SELECT checksum,rolled_back_at FROM content_bundle_installs WHERE id=$1',[catalog.id]);
 if(installed){
  if(installed.checksum!==checksum||installed.rolled_back_at)throw Error('Edition conflict');
  // Only restore files referenced by live rows with this edition's asset identities.
  if(apply){
   const sources=new Map([...catalog.nodes,...catalog.works].flatMap(item=>item.assets.map(a=>[a.id,a])));
   const media=await rows('SELECT id,storage_key,sha256 FROM work_assets WHERE id=ANY($1) UNION ALL SELECT id,storage_key,NULL FROM atomic_assets WHERE id=ANY($1)',[[...sources.keys()]]);
   for(const a of media){
    const source=sources.get(a.id);
    if(!/^(users\/[a-zA-Z0-9_-]+\/works\/[a-zA-Z0-9_-]+\/|atomic\/[a-zA-Z0-9_-]+\/)[a-f0-9-]+$/.test(a.storage_key))throw Error('Unexpected storage record');
    if(!a.sha256||a.sha256===source.sha256)await copyAsset(source,a.storage_key);
   }
  }
  await installCaseLinks();
  await query(apply?'COMMIT':'ROLLBACK');return {alreadyInstalled:true};
 }
 if(!(await rows('SELECT id FROM content_bundle_installs WHERE id=$1 AND rolled_back_at IS NULL',[pilot])).length)throw Error('Install the November pilot first');
 await installNodes();await installWorks();await installTools();await installCaseLinks();
 await query('INSERT INTO content_bundle_installs(id,checksum,snapshot_json) VALUES($1,$2,$3)',[catalog.id,checksum,counts]);
 await query(apply?'COMMIT':'ROLLBACK');return {mode,...counts,uniqueMedia:files.size};
}
try{console.log(JSON.stringify(await sync()));}catch(error){await query('ROLLBACK');throw error;}finally{await client.end();}
