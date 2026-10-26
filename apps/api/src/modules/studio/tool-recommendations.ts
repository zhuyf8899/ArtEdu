import { Body,Controller,Get,Injectable,Param,Patch,Post,Req,BadRequestException,NotFoundException } from '@nestjs/common';
import type {FastifyRequest} from 'fastify';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {parseInput} from '../../common/validation';
import {AuthService,type Actor} from '../auth/auth.service';
import {DatabaseService} from '../database/database.service';

export const recommendationSchema=z.object({title:z.string().trim().min(2).max(80),url:z.string().trim().max(2048).url().refine(value=>{try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password;}catch{return false;}},'请填写不含凭据的 HTTPS 官网地址'),reason:z.string().trim().min(5).max(2000)}).strict();
export const recommendationDecision=z.object({status:z.enum(['accepted','rejected']),feedback:z.string().trim().min(2).max(1000)}).strict();
@Injectable()
export class ToolRecommendationsService{
 constructor(private readonly db:DatabaseService,private readonly auth:AuthService){}
 async list(actor:Actor,managed=false){
  if(managed)this.auth.requireAnyRole(actor,['admin','operator']);
  const r=await this.db.query(`SELECT t.id,t.title,t.url,t.reason,t.status,t.feedback,t.created_at AS "createdAt",t.decided_at AS "decidedAt",u.display_name AS author FROM tool_recommendations t JOIN users u ON u.id=t.user_id WHERE ($1::boolean OR t.user_id=$2) ORDER BY t.created_at DESC LIMIT 200`,[managed,actor.id]);return {items:r.rows};
 }
 async create(actor:Actor,input:z.infer<typeof recommendationSchema>){
  return this.db.transaction(async c=>{
   await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',['tool-recommendations:'+actor.id]);
   const pending=await c.query("SELECT url FROM tool_recommendations WHERE user_id=$1 AND status='pending'",[actor.id]);
   if(pending.rows.length>=10)throw new BadRequestException('最多保留 10 项待审推荐，请等待反馈后再提交');
   const url=new URL(input.url).href;
   if(pending.rows.some(row=>row.url===url))throw new BadRequestException('这个工具已在你的待审推荐中');
   const r=await c.query("INSERT INTO tool_recommendations(id,user_id,title,url,reason) VALUES($1,$2,$3,$4,$5) RETURNING id,status",[randomUUID(),actor.id,input.title,url,input.reason]);return r.rows[0];
  });
 }
 async decide(actor:Actor,id:string,input:z.infer<typeof recommendationDecision>){
  this.auth.requireAnyRole(actor,['admin','operator']);
  const r=await this.db.query("UPDATE tool_recommendations SET status=$2,feedback=$3,reviewer_id=$4,decided_at=CURRENT_TIMESTAMP WHERE id=$1 AND status='pending' AND user_id<>$4 RETURNING id,status",[id,input.status,input.feedback,actor.id]);
  if(!r.rows.length)throw new NotFoundException('推荐已处理、不存在或属于自己，请刷新后由另一位审核人员处理');return r.rows[0];
 }
}
@Controller()
export class ToolRecommendationsController{
 constructor(private readonly service:ToolRecommendationsService,private readonly auth:AuthService){}
 @Get('me/tool-recommendations')mine(@Req()req:FastifyRequest){return this.auth.getActor(req).then(a=>this.service.list(a));}
 @Post('me/tool-recommendations')create(@Req()req:FastifyRequest,@Body()body:unknown){const input=parseInput(recommendationSchema,body);return this.auth.getActor(req).then(a=>this.service.create(a,input));}
 @Get('admin/tool-recommendations')queue(@Req()req:FastifyRequest){return this.auth.getActor(req).then(a=>this.service.list(a,true));}
 @Patch('admin/tool-recommendations/:id')decide(@Req()req:FastifyRequest,@Param('id')id:string,@Body()body:unknown){const input=parseInput(recommendationDecision,body);return this.auth.getActor(req).then(a=>this.service.decide(a,id,input));}
}
