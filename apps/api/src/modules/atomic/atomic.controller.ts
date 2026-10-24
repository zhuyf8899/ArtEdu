import { BadRequestException,Body,Controller,Get,Param,Post,Put,Query,Req,Res,Head } from '@nestjs/common';
import type { FastifyRequest,FastifyReply } from 'fastify';
import { createReadStream } from 'node:fs';
import { AuthService } from '../auth/auth.service';
import { parseAtomic as parseInput } from './atomic.contracts';
import { resolveByteRange } from '../../common/byte-range';
import { AtomicService } from './atomic.service';
import { createAtomicSchema,saveAtomicSchema,atomicRevisionSchema,atomicDecisionSchema,atomicListSchema,atomicDetailSchema,atomicProgressSchema,atomicGradeSchema,atomicTaskSchema,atomicKnowledgeSchema } from './atomic.contracts';
@Controller('atomic')
export class AtomicController {
 constructor(private readonly atomic:AtomicService,private readonly auth:AuthService){}
 @Get('abilities')async abilities(@Req()req:FastifyRequest){return this.atomic.abilities(await this.auth.getActor(req));}
 @Get('knowledge/:id')async knowledge(@Req()req:FastifyRequest,@Param('id')id:string){return this.atomic.knowledgeLearning(await this.auth.getActor(req),id);}
 @Put('nodes/:id/knowledge')async bindKnowledge(@Req()req:FastifyRequest,@Param('id')id:string,@Body()body:unknown){return this.atomic.bindKnowledge(await this.auth.getActor(req),id,parseInput(atomicKnowledgeSchema,body));}
 @Get('portrait')async portrait(@Req()req:FastifyRequest){return this.atomic.portrait(await this.auth.getActor(req));}
 @Get('catalog')async list(@Req()req:FastifyRequest,@Query()query:unknown){return this.atomic.list(await this.auth.getActor(req),parseInput(atomicListSchema,query));}
 @Get('submissions')async submissions(@Req()req:FastifyRequest){return this.atomic.submissions(await this.auth.getActor(req));}
 @Post('nodes')async create(@Req()req:FastifyRequest,@Body()body:unknown){return this.atomic.create(await this.auth.getActor(req),parseInput(createAtomicSchema,body));}
 @Get('nodes/:id')async detail(@Req()req:FastifyRequest,@Param('id')id:string,@Query()query:unknown){return this.atomic.detail(await this.auth.getActor(req),id,parseInput(atomicDetailSchema,query).revision);}
 @Put('nodes/:id')async save(@Req()req:FastifyRequest,@Param('id')id:string,@Body()body:unknown){return this.atomic.save(await this.auth.getActor(req),id,parseInput(saveAtomicSchema,body));}
 @Post('nodes/:id/submit')async submit(@Req()req:FastifyRequest,@Param('id')id:string,@Body()body:unknown){return this.atomic.submit(await this.auth.getActor(req),id,parseInput(atomicRevisionSchema,body).revision);}
 @Post('nodes/:id/decision')async decide(@Req()req:FastifyRequest,@Param('id')id:string,@Body()body:unknown){return this.atomic.decide(await this.auth.getActor(req),id,parseInput(atomicDecisionSchema,body));}
 @Put('nodes/:id/progress')async progress(@Req()req:FastifyRequest,@Param('id')id:string,@Body()body:unknown){return this.atomic.progress(await this.auth.getActor(req),id,parseInput(atomicProgressSchema,body));}
 @Post('nodes/:id/tasks')async task(@Req()req:FastifyRequest,@Param('id')id:string,@Body()body:unknown){return this.atomic.task(await this.auth.getActor(req),id,parseInput(atomicTaskSchema,body));}
 @Post('nodes/:id/grade')async grade(@Req()req:FastifyRequest,@Param('id')id:string,@Body()body:unknown){return this.atomic.grade(await this.auth.getActor(req),id,parseInput(atomicGradeSchema,body));}
 @Post('nodes/:id/assets')async upload(@Req()req:FastifyRequest,@Param('id')id:string,@Query()query:unknown){const revision=parseInput(atomicDetailSchema,query).revision;if(!revision)throw new BadRequestException('需要草稿版本');return this.atomic.upload(await this.auth.getActor(req),id,revision,req);}
 @Head('nodes/:id/assets/:assetId')async head(@Req()req:FastifyRequest,@Res()reply:FastifyReply,@Param('id')id:string,@Param('assetId')assetId:string,@Query()query:unknown){return this.file(req,reply,id,assetId,query);}
 @Get('nodes/:id/assets/:assetId')async file(@Req()req:FastifyRequest,@Res()reply:FastifyReply,@Param('id')id:string,@Param('assetId')assetId:string,@Query()query:unknown){
  const a=await this.atomic.asset(await this.auth.getActor(req),id,assetId,parseInput(atomicDetailSchema,query).revision);
  const range=resolveByteRange(a.size,req.method==='HEAD'||req.headers['if-range']?undefined:req.headers.range);
  reply.header('Content-Type',a.mimeType).header('Content-Disposition',`inline; filename*=UTF-8''${encodeURIComponent(a.fileName)}`).header('Cache-Control','private, no-store').header('X-Content-Type-Options','nosniff').header('Accept-Ranges','bytes').header('Content-Length',String(range.length)).code(range.status);
  if(range.status===206)reply.header('Content-Range',`bytes ${range.start}-${range.end}/${a.size}`);
  if(range.status===416)reply.header('Content-Range',`bytes */${a.size}`);
  return reply.send(req.method==='HEAD'||range.status===416?undefined:createReadStream(a.filePath,range.status===206?{start:range.start,end:range.end}:undefined));
 }
}
