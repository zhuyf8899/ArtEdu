import {Body,Controller,Get,Put,Req} from '@nestjs/common';
import {z} from 'zod';
import type {FastifyRequest} from 'fastify';
import {DatabaseService} from '../database/database.service';
import {AuthService} from '../auth/auth.service';
import {parseInput} from '../../common/validation';
import {workflowFeatureEnabled} from './workflow-feature';
@Controller()
export class WorkflowFeatureController {
 constructor(private readonly db:DatabaseService,private readonly auth:AuthService){}
 @Get('platform/comfyui-feature')
 async get(@Req()request:FastifyRequest){await this.auth.getActor(request);return {enabled:await workflowFeatureEnabled(this.db)};}
 @Put('admin/comfyui-feature')
 async set(@Req()request:FastifyRequest,@Body()body:unknown){
  const actor=await this.auth.getActor(request);this.auth.requireAnyRole(actor,['admin']);
  const input=parseInput(z.object({enabled:z.boolean()}).strict(),body);
  await this.db.transaction(async client=>{
   await client.query('UPDATE comfy_feature_settings SET enabled=$1,updated_by=$2,updated_at=now() WHERE id=true',[input.enabled,actor.id]);
   if(!input.enabled){
    const jobs=await client.query("UPDATE comfy_jobs SET status=CASE WHEN status='queued' THEN 'cancelled' ELSE 'cancelling' END,updated_at=now() WHERE status IN ('queued','running') RETURNING run_id,status");
    for(const job of jobs.rows)if(job.status==='cancelled')await client.query("UPDATE workflow_runs SET status='cancelled',updated_at=now() WHERE id=$1",[job.run_id]);
   }
  });return input;
 }
}
