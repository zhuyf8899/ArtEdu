import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { rm,stat } from 'node:fs/promises';
import path from 'node:path';
import type { PoolClient } from 'pg';
import type { FastifyRequest } from 'fastify';
import { getEnvironment } from '../../common/environment';
import { parseAtomic as parseInput } from './atomic.contracts';
import { courseUploadPolicy } from '../../common/upload-policy';
import { AuthService, type Actor } from '../auth/auth.service';
import { DatabaseService } from '../database/database.service';
import { storePrivateUpload,workAssetMimeTypes } from '../studio/private-upload';
import { atomPayload,coursePayload,type AtomPayload,type CoursePayload } from './atomic.contracts';

type Node={id:string;kind:'teaching'|'reflection'|'course';owner_id:string;parent_id:string|null;published_revision:number|null};
type Version={revision:number;status:string;payload:any};
type Queryable={query(text:string,values?:any[]):Promise<{rows:any[];rowCount:number|null}>};
const reviewer=(a:Actor)=>a.roles.some(r=>['admin','operator'].includes(r));
const educator=(a:Actor)=>a.roles.some(r=>['admin','teacher'].includes(r));
@Injectable()
export class AtomicService {
 constructor(private readonly db:DatabaseService,private readonly auth:AuthService){}
 private async node(client:Queryable,id:string,lock=false):Promise<Node>{const r=await client.query('SELECT * FROM atomic_nodes WHERE id=$1'+(lock?' FOR UPDATE':''),[id]);if(!r.rows[0])throw new NotFoundException('学习内容不存在');return r.rows[0];}
 private owner(actor:Actor,n:Node){if(n.owner_id!==actor.id&&!actor.roles.includes('admin'))throw new ForbiddenException('只能编辑自己创建的学习内容');}
 // Teachers moderate supplements to their own atoms, never unrelated private drafts.
 private async responsibleTeacher(client:Queryable,actor:Actor,n:Node){
  if(!actor.roles.includes('teacher')||n.kind!=='reflection'||!n.parent_id)return false;
  const result=await client.query('SELECT owner_id FROM atomic_nodes WHERE id=$1',[n.parent_id]);
  return result.rows[0]?.owner_id===actor.id;
 }
 private async latest(client:Queryable,id:string):Promise<Version>{const r=await client.query('SELECT * FROM atomic_versions WHERE node_id=$1 ORDER BY revision DESC LIMIT 1',[id]);return r.rows[0];}
 private audit(client:PoolClient,actor:Actor,n:Node,revision:number,action:string,note=''){return client.query('INSERT INTO atomic_audit(id,node_id,revision,actor_id,action,note) VALUES($1,$2,$3,$4,$5,$6)',[randomUUID(),n.id,revision,actor.id,action,note]);}
 private async payload(client:PoolClient,actor:Actor,n:Node,input:unknown){
  if(n.kind==='course'){
   const p=parseInput(coursePayload,input);
   for(const s of [...p.steps].sort((a,b)=>a.atomId.localeCompare(b.atomId))){
    const r=await client.query(`SELECT n.kind,v.status FROM atomic_nodes n JOIN atomic_versions v ON v.node_id=n.id WHERE n.id=$1 AND v.revision=$2 FOR SHARE OF n`,[s.atomId,s.revision]);
    if(!r.rows[0]||r.rows[0].kind==='course'||r.rows[0].status!=='published')throw new BadRequestException('课程只能引用已审核发布的原子版本');
   }return p;
  }
  const p=parseInput(atomPayload,input);
  if(new Set(p.assetIds).size!==p.assetIds.length)throw new BadRequestException('附件重复');
  if(p.assetIds.length){const r=await client.query('SELECT id FROM atomic_assets WHERE node_id=$1 AND id=ANY($2::text[])',[n.id,p.assetIds]);if(r.rows.length!==p.assetIds.length)throw new ForbiddenException('附件不属于此原子');}
  return p;
 }
 async list(actor:Actor,input:{view:string;query:string;page:number}){
  if(input.view==='review')this.auth.requireAnyRole(actor,['admin','operator','teacher']);
  if(input.view==='learning'){
   const r=await this.db.query(`SELECT n.id,n.kind,u.display_name AS author,v.revision,v.status,p.stage,v.payload->>'title' AS title,v.payload->>'summary' AS summary,v.payload->'knowledge' AS knowledge,v.payload->'minutes' AS minutes,COUNT(*) OVER()::int AS total FROM atomic_progress p JOIN atomic_nodes n ON n.id=p.node_id JOIN atomic_versions v ON v.node_id=p.node_id AND v.revision=p.revision JOIN users u ON u.id=n.owner_id WHERE p.user_id=$1 AND v.status='published' AND (v.payload->>'title' ILIKE $2 OR v.payload->>'summary' ILIKE $2 OR v.payload->>'objective' ILIKE $2 OR v.payload->>'knowledge' ILIKE $2) ORDER BY p.updated_at DESC,n.id,p.revision DESC LIMIT 24 OFFSET $3`,[actor.id,`%${input.query}%`,(input.page-1)*24]);
   return {items:r.rows.map(({total,...row})=>row),total:r.rows[0]?.total??0,page:input.page};
  }
  const result=await this.db.query(`SELECT n.id,n.kind,n.owner_id AS "ownerId",n.parent_id AS "parentId",n.published_revision AS "publishedRevision",u.display_name AS author,v.revision,v.status,p.stage,v.payload->>'title' AS title,v.payload->>'summary' AS summary,v.payload->'knowledge' AS knowledge,v.payload->'minutes' AS minutes,COUNT(*) OVER()::int AS total
   FROM atomic_nodes n JOIN users u ON u.id=n.owner_id LEFT JOIN atomic_nodes source ON source.id=n.parent_id JOIN LATERAL(SELECT * FROM atomic_versions av WHERE av.node_id=n.id AND CASE WHEN $1='mine' OR $1='review' THEN TRUE ELSE av.revision=n.published_revision END ORDER BY av.revision DESC LIMIT 1)v ON TRUE
   LEFT JOIN atomic_progress p ON p.node_id=n.id AND p.revision=v.revision AND p.user_id=$2
   WHERE CASE WHEN $1='mine' THEN n.owner_id=$2 WHEN $1='review' THEN v.status='pending_review' AND n.owner_id<>$2 AND ($5 OR (n.kind='reflection' AND source.owner_id=$2)) WHEN $1='courses' THEN n.kind='course' ELSE n.kind<>'course' END
   AND (v.payload->>'title' ILIKE $3 OR v.payload->>'summary' ILIKE $3 OR v.payload->>'objective' ILIKE $3 OR v.payload->>'knowledge' ILIKE $3)
   ORDER BY n.created_at DESC,n.id LIMIT 24 OFFSET $4`,[input.view,actor.id,`%${input.query}%`,(input.page-1)*24,reviewer(actor)]);
  return {items:result.rows.map(({total,...row})=>row),total:result.rows[0]?.total??0,page:input.page};
 }
 async create(actor:Actor,input:{kind:Node['kind'];parentId?:string;payload?:unknown}){
  if(input.kind!=='reflection'&&!educator(actor))throw new ForbiddenException('只有教师和管理员可以创建教学原子或课程');
  if(input.kind==='reflection'&&!input.parentId)throw new BadRequestException('学习心得需要关联原子');
  if(input.kind!=='reflection'&&input.parentId)throw new BadRequestException('此类内容不能设置心得父节点');
  return this.db.transaction(async c=>{
   if(input.parentId){const p=await this.node(c,input.parentId);if(p.kind==='course'||!p.published_revision)throw new BadRequestException('请选择已发布的原子作为心得分支');}
   const n:Node={id:randomUUID(),kind:input.kind,owner_id:actor.id,parent_id:input.parentId??null,published_revision:null};
   const p=await this.payload(c,actor,n,input.payload);
   await c.query('INSERT INTO atomic_nodes(id,kind,owner_id,parent_id) VALUES($1,$2,$3,$4)',[n.id,n.kind,n.owner_id,n.parent_id]);
   await c.query('INSERT INTO atomic_versions(node_id,revision,payload) VALUES($1,1,$2)',[n.id,JSON.stringify(p)]);
   await this.audit(c,actor,n,1,'create');return {id:n.id,revision:1};
  });
 }
 async save(actor:Actor,id:string,input:{expectedRevision:number;payload?:unknown}){
  return this.db.transaction(async c=>{
   const n=await this.node(c,id,true);this.owner(actor,n);const previous=await this.latest(c,id);
   if(previous.revision!==input.expectedRevision||previous.status==='pending_review')throw new ConflictException('内容已变化或正在审核，请刷新；审核中不能修改');
   const p=await this.payload(c,actor,n,input.payload),revision=previous.revision+1;
   await c.query('INSERT INTO atomic_versions(node_id,revision,payload) VALUES($1,$2,$3)',[id,revision,JSON.stringify(p)]);await this.audit(c,actor,n,revision,'save');
   return {id,revision};
  });
 }
 async submit(actor:Actor,id:string,revision:number){return this.db.transaction(async c=>{
  const n=await this.node(c,id,true);this.owner(actor,n);const v=await this.latest(c,id);
  if(v.revision!==revision||v.status!=='draft')throw new ConflictException('只能提交当前草稿；退回内容请先编辑为新草稿版本');
  await this.payload(c,actor,n,v.payload);
  await c.query("UPDATE atomic_versions SET status='pending_review' WHERE node_id=$1 AND revision=$2",[id,revision]);await this.audit(c,actor,n,revision,'submit');return {status:'pending_review'};
 });}
 async decide(actor:Actor,id:string,input:{revision:number;decision:string;note:string}){
  this.auth.requireAnyRole(actor,['admin','operator','teacher']);return this.db.transaction(async c=>{
   const n=await this.node(c,id,true);if(n.owner_id===actor.id)throw new ForbiddenException('不能审核自己的内容，请由另一位审核人员处理');
   if(!reviewer(actor)&&!await this.responsibleTeacher(c,actor,n))throw new ForbiddenException('教师只能审核关联到自己原子的学习心得');
   const v=await this.latest(c,id);if(v.revision!==input.revision||v.status!=='pending_review')throw new ConflictException('审核状态已变化，请刷新');
   if(input.decision==='publish')await this.payload(c,actor,n,v.payload);
   const status=input.decision==='publish'?'published':'rejected';
   await c.query('UPDATE atomic_versions SET status=$3 WHERE node_id=$1 AND revision=$2',[id,v.revision,status]);
   if(status==='published')await c.query('UPDATE atomic_nodes SET published_revision=$2 WHERE id=$1',[id,v.revision]);
   await this.audit(c,actor,n,v.revision,input.decision,input.note);return {status};
  });
 }
 private async visible(actor:Actor,id:string,revision?:number){
  const n=await this.node(this.db,id);const latest=await this.latest(this.db,id);
  const teacherReview=latest.status==='pending_review'&&await this.responsibleTeacher(this.db,actor,n);
  const selected=revision??((n.owner_id===actor.id||reviewer(actor)||teacherReview)?latest.revision:n.published_revision);
  const r=await this.db.query('SELECT * FROM atomic_versions WHERE node_id=$1 AND revision=$2',[id,selected]);const v=r.rows[0] as Version;
  if(!v||(v.status!=='published'&&n.owner_id!==actor.id&&!reviewer(actor)&&!(teacherReview&&v.status==='pending_review'&&v.revision===latest.revision)))throw new NotFoundException('此版本未发布或无权查看');
  return {n,v};
 }
 async detail(actor:Actor,id:string,revision?:number){
  const {n,v}=await this.visible(actor,id,revision);
  const canReview=v.status==='pending_review'&&n.owner_id!==actor.id&&(reviewer(actor)||await this.responsibleTeacher(this.db,actor,n));
  const parent=n.parent_id?await this.db.query(`SELECT v.payload->>'title' AS title FROM atomic_nodes n JOIN atomic_versions v ON v.node_id=n.id AND v.revision=n.published_revision WHERE n.id=$1`,[n.parent_id]):null;
  const progress=await this.db.query('SELECT stage,submission,feedback,updated_at AS "updatedAt" FROM atomic_progress WHERE user_id=$1 AND node_id=$2 AND revision=$3',[actor.id,id,v.revision]);
  const assets=await this.db.query('SELECT id,file_name AS "fileName",mime_type AS "mimeType",size_bytes AS size FROM atomic_assets WHERE node_id=$1 AND id=ANY($2::text[])',[id,v.payload.assetIds??[]]);
  const branches=await this.db.query(`SELECT n.id,v.payload->>'title' AS title,u.display_name AS author,n.published_revision AS revision FROM atomic_nodes n JOIN atomic_versions v ON v.node_id=n.id AND v.revision=n.published_revision JOIN users u ON u.id=n.owner_id WHERE n.parent_id=$1 ORDER BY n.created_at DESC`,[id]);
  const usedBy=await this.db.query(`SELECT n.id,v.payload->>'title' AS title,n.published_revision AS revision FROM atomic_nodes n JOIN atomic_versions v ON v.node_id=n.id AND v.revision=n.published_revision WHERE n.kind='course' AND EXISTS(SELECT 1 FROM jsonb_array_elements(v.payload->'steps') s WHERE s->>'atomId'=$1)`,[id]);
  const history=await this.db.query("SELECT revision,payload->>'title' AS title FROM atomic_versions WHERE node_id=$1 AND status='published' ORDER BY revision DESC",[id]);
  const feedback=await this.db.query('SELECT action,note,created_at AS "createdAt" FROM atomic_audit WHERE node_id=$1 AND revision=$2 ORDER BY created_at DESC',[id,v.revision]);
  const steps=[];
  if(n.kind==='course')for(const s of (v.payload as CoursePayload).steps){
   const r=await this.db.query(`SELECT v.payload->>'title' AS title,v.payload->>'summary' AS summary,v.payload->>'completion' AS completion,n.published_revision AS "latestRevision",p.stage,p.feedback FROM atomic_nodes n JOIN atomic_versions v ON v.node_id=n.id AND v.revision=$2 LEFT JOIN atomic_progress p ON p.node_id=v.node_id AND p.revision=v.revision AND p.user_id=$3 WHERE n.id=$1 AND v.status='published'`,[s.atomId,s.revision,actor.id]);
   const task=await this.db.query('SELECT stage,submission,feedback FROM atomic_task_submissions WHERE user_id=$1 AND course_id=$2 AND revision=$3 AND atom_id=$4',[actor.id,id,v.revision,s.atomId]);
   steps.push({...s,...r.rows[0],available:Boolean(r.rows[0]),taskProgress:task.rows[0]??null});
  }
  return {id,kind:n.kind,ownerId:n.owner_id,parentId:n.parent_id,parentTitle:parent?.rows[0]?.title??'',canReview,publishedRevision:n.published_revision,revision:v.revision,status:v.status,payload:v.payload,progress:progress.rows[0]??null,assets:assets.rows.map(a=>({...a,url:`/api/atomic/nodes/${id}/assets/${a.id}?revision=${v.revision}`})),branches:branches.rows,usedBy:usedBy.rows,versions:history.rows,feedback:feedback.rows.filter(x=>['publish','reject'].includes(x.action)),steps};
 }
 async progress(actor:Actor,id:string,input:{revision:number;action:string;submission:string}){return this.db.transaction(async c=>{
  const n=await this.node(c,id,true),r=await c.query('SELECT * FROM atomic_versions WHERE node_id=$1 AND revision=$2',[id,input.revision]);const v:Version=r.rows[0];
  if(n.kind==='course'||v?.status!=='published')throw new BadRequestException('只能记录已发布原子的学习情况');
  if(input.action==='complete'&&v.payload.completion!=='read')throw new BadRequestException('练习需提交后由教师评价，不能自行通过');
  if(input.action==='submit'&&(v.payload.completion!=='practice'||input.submission.length<10))throw new BadRequestException('请提交至少十个字的练习说明');
  const stage=input.action==='complete'?'completed':input.action==='submit'?'submitted':'read';
  await c.query(`INSERT INTO atomic_progress(user_id,node_id,revision,stage,submission) VALUES($1,$2,$3,$4,$5) ON CONFLICT(user_id,node_id,revision) DO UPDATE SET stage=EXCLUDED.stage,submission=CASE WHEN EXCLUDED.stage='read' THEN atomic_progress.submission ELSE EXCLUDED.submission END,submission_version=CASE WHEN EXCLUDED.stage='submitted' THEN atomic_progress.submission_version+1 ELSE atomic_progress.submission_version END,feedback='',reviewer_id=NULL,updated_at=CURRENT_TIMESTAMP WHERE atomic_progress.stage<>'completed' AND (EXCLUDED.stage<>'read' OR atomic_progress.stage='read')`,[actor.id,id,input.revision,stage,input.submission]);
  return {ok:true};
 });}
 async task(actor:Actor,id:string,input:{revision:number;atomId:string;submission:string}){return this.db.transaction(async c=>{
  const n=await this.node(c,id,true);
  if(n.kind!=='course')throw new BadRequestException('不存在此课程专属任务');
  const r=await c.query("SELECT payload FROM atomic_versions WHERE node_id=$1 AND revision=$2 AND status='published'",[id,input.revision]);
  const s=(r.rows[0]?.payload as CoursePayload)?.steps.find(x=>x.atomId===input.atomId);
  if(!s?.task)throw new BadRequestException('不存在此课程专属任务');
  await c.query(`INSERT INTO atomic_task_submissions(user_id,course_id,revision,atom_id,submission,stage) VALUES($1,$2,$3,$4,$5,'submitted') ON CONFLICT(user_id,course_id,revision,atom_id) DO UPDATE SET submission=EXCLUDED.submission,stage='submitted',submission_version=atomic_task_submissions.submission_version+1,feedback='',reviewer_id=NULL,updated_at=CURRENT_TIMESTAMP WHERE atomic_task_submissions.stage<>'completed'`,[actor.id,id,input.revision,input.atomId,input.submission]);return {ok:true};
 });}
 async submissions(actor:Actor){
  if(!educator(actor)&&!reviewer(actor))throw new ForbiddenException('仅教学与审核人员可评价练习');
  const r=await this.db.query(`SELECT p.user_id AS "userId",p.node_id AS "nodeId",p.revision,NULL::text AS "atomId",p.submission,p.submission_version AS "submissionVersion",p.updated_at AS "updatedAt",u.display_name AS learner,v.payload->>'title' AS title FROM atomic_progress p JOIN atomic_nodes n ON n.id=p.node_id LEFT JOIN atomic_nodes source ON source.id=n.parent_id JOIN atomic_versions v ON v.node_id=p.node_id AND v.revision=p.revision JOIN users u ON u.id=p.user_id WHERE p.stage='submitted' AND p.user_id<>$1 AND (n.owner_id=$1 OR $2 OR (n.kind='reflection' AND source.owner_id=$1))
   UNION ALL SELECT p.user_id,p.course_id,p.revision,p.atom_id,p.submission,p.submission_version,p.updated_at,u.display_name,v.payload->>'title' FROM atomic_task_submissions p JOIN atomic_nodes n ON n.id=p.course_id JOIN atomic_versions v ON v.node_id=p.course_id AND v.revision=p.revision JOIN users u ON u.id=p.user_id WHERE p.stage='submitted' AND p.user_id<>$1 AND(n.owner_id=$1 OR $2) ORDER BY "updatedAt" LIMIT 100`,[actor.id,reviewer(actor)]);
  return {items:r.rows};
 }
 async grade(actor:Actor,id:string,input:{revision:number;userId:string;atomId?:string;expectedSubmissionVersion:number;decision:string;note:string}){return this.db.transaction(async c=>{
  const n=await this.node(c,id,true);if(!(reviewer(actor)||(educator(actor)&&n.owner_id===actor.id)||await this.responsibleTeacher(c,actor,n))||input.userId===actor.id)throw new ForbiddenException('不能评价此练习或自己的提交');
  const task=n.kind==='course';if(task!==Boolean(input.atomId))throw new BadRequestException('练习类型不匹配');
  const table=task?'atomic_task_submissions':'atomic_progress',column=task?'course_id':'node_id';
  const r=await c.query(`UPDATE ${table} SET stage=$4,feedback=$5,reviewer_id=$6,updated_at=CURRENT_TIMESTAMP WHERE ${column}=$1 AND revision=$2 AND user_id=$3 AND stage='submitted'${task?' AND atom_id=$7 AND submission_version=$8':' AND submission_version=$7'} RETURNING user_id`,[id,input.revision,input.userId,input.decision==='pass'?'completed':'needs_revision',input.note,actor.id,...(task?[input.atomId]:[]),input.expectedSubmissionVersion]);
  if(!r.rowCount)throw new ConflictException('练习状态已变化，请刷新');await this.audit(c,actor,n,input.revision,'grade',input.note);return {ok:true};
 });}
 async upload(actor:Actor,id:string,revision:number,request:FastifyRequest){
  const n=await this.node(this.db,id);this.owner(actor,n);if(n.kind==='course')throw new BadRequestException('请将教学附件上传到原子');
  const v=await this.latest(this.db,id);if(v.revision!==revision||v.status!=='draft')throw new ConflictException('请先保存新草稿再上传附件');
  if(!getEnvironment().fileUploadsEnabled)throw new ForbiddenException('上传未启用');
  const part=await request.file({limits:{fileSize:courseUploadPolicy().videoBytes}});if(!part)throw new BadRequestException('请选择文件');
  const upload=await storePrivateUpload(part,getEnvironment().uploadRoot,workAssetMimeTypes,`atomic/${id}`,courseUploadPolicy().videoBytes);
  try{return await this.db.transaction(async c=>{
   await this.node(c,id,true);const current=await this.latest(c,id);if(current.revision!==revision||current.status!=='draft')throw new ConflictException('草稿已变化，请刷新');
   const p=current.payload as AtomPayload;if(p.assetIds.length>=12)throw new BadRequestException('每个原子最多十二个附件');
   const assetId=randomUUID();await c.query('INSERT INTO atomic_assets(id,node_id,storage_key,file_name,mime_type,size_bytes) VALUES($1,$2,$3,$4,$5,$6)',[assetId,id,upload.storageKey,upload.fileName,upload.mimeType,upload.sizeBytes]);
   await c.query("UPDATE atomic_versions SET payload=jsonb_set(payload,'{assetIds}',$3::jsonb) WHERE node_id=$1 AND revision=$2",[id,revision,JSON.stringify([...p.assetIds,assetId])]);await this.audit(c,actor,n,revision,'upload',upload.fileName);return {id:assetId};
  });}catch(e){await rm(path.join(getEnvironment().uploadRoot,upload.storageKey),{force:true});throw e;}
 }
 async asset(actor:Actor,id:string,assetId:string,revision?:number){
  const {v}=await this.visible(actor,id,revision);if(!(v.payload.assetIds??[]).includes(assetId))throw new NotFoundException('此版本无该附件');
  const r=await this.db.query('SELECT * FROM atomic_assets WHERE id=$1 AND node_id=$2',[assetId,id]);const a=r.rows[0];
  if(!a||!new RegExp(`^atomic/${id}/[a-zA-Z0-9._-]+$`).test(a.storage_key))throw new NotFoundException('附件不存在');
  const filePath=path.resolve(getEnvironment().uploadRoot,a.storage_key);const size=(await stat(filePath).catch(()=>{throw new NotFoundException('附件文件缺失');})).size;
  return {filePath,size,mimeType:a.mime_type,fileName:a.file_name};
 }
}
