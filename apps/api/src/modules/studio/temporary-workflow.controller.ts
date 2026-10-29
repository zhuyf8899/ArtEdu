import {BadRequestException,Body,Controller,Delete,Get,Param,Post,Put,Req,Res} from '@nestjs/common';
import type {FastifyRequest,FastifyReply} from 'fastify';
import {z} from 'zod';
import {AuthService} from '../auth/auth.service';
import {parseInput} from '../../common/validation';
import {TemporaryWorkflowService} from './temporary-workflow.service';
const id=z.string().min(1).max(160),revision=z.number().int().positive();
const graph=z.object({name:z.string().trim().min(2).max(120),definition:z.record(z.string(),z.unknown())});
@Controller('temporary-workflows')
export class TemporaryWorkflowController {
 constructor(private readonly service:TemporaryWorkflowService,private readonly auth:AuthService){}
 @Post()async create(@Req()r:FastifyRequest,@Body()b:unknown){return this.service.create(await this.auth.getActor(r),parseInput(graph.strict(),b));}
 @Post('restore')async restore(@Req()r:FastifyRequest,@Body()b:unknown){return this.service.restore(await this.auth.getActor(r),parseInput(graph.extend({id,revision,source:z.object({workflowId:id,versionId:id}).optional()}).strict(),b));}
 @Post('from-draft/:id')async fromDraft(@Req()r:FastifyRequest,@Param('id')id:string){return this.service.fromDraft(await this.auth.getActor(r),id);}
 @Get(':id')async get(@Req()r:FastifyRequest,@Param('id')id:string){return this.service.get(await this.auth.getActor(r),id);}
 @Put(':id')async edit(@Req()r:FastifyRequest,@Param('id')id:string,@Body()b:unknown){return this.service.edit(await this.auth.getActor(r),id,parseInput(graph.extend({expectedRevision:revision,changeSummary:z.string().max(1000).optional()}).strict(),b));}
 @Delete(':id')async remove(@Req()r:FastifyRequest,@Param('id')id:string){return this.service.remove(await this.auth.getActor(r),id);}
 @Post(':id/assets')async upload(@Req()r:FastifyRequest,@Param('id')id:string){const actor=await this.auth.getActor(r);const part=await r.file({limits:{files:1,fileSize:8*1024*1024}});if(!part)throw new BadRequestException('请选择 PNG 图片');return this.service.upload(actor,id,await part.toBuffer(),part.filename);}
 @Put(':id/bindings/:node')async bind(@Req()r:FastifyRequest,@Param('id')id:string,@Param('node')node:string,@Body()b:unknown){return this.service.bind(await this.auth.getActor(r),id,node,parseInput(z.object({revision,referenceFileId:idSchema(),maskFileId:idSchema().optional()}).strict(),b));}
 @Post(':id/execute')async start(@Req()r:FastifyRequest,@Param('id')id:string,@Body()b:unknown){return this.service.start(await this.auth.getActor(r),id,parseInput(z.object({revision,requestId:z.string().uuid()}).strict(),b));}
 @Post(':id/save-draft')async save(@Req()r:FastifyRequest,@Param('id')id:string,@Body()b:unknown){return this.service.saveFormal(await this.auth.getActor(r),id,parseInput(z.object({revision}).strict(),b).revision);}
 @Get(':id/assets/:assetId')async asset(@Req()r:FastifyRequest,@Res()reply:FastifyReply,@Param('id')id:string,@Param('assetId')assetId:string){const a=this.service.asset(await this.auth.getActor(r),id,assetId);reply.header('Cache-Control','private, no-store').header('X-Content-Type-Options','nosniff').header('Content-Type',a.mimeType).header('Content-Disposition',`attachment; filename*=UTF-8''${encodeURIComponent(a.fileName)}`);return reply.send(a.bytes);}
}
function idSchema(){return z.string().min(1).max(160);}
