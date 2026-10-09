import { registrySchema,progressSchema,finishSchema } from '../studio/comfy-contracts';
import { BadRequestException } from '@nestjs/common';
import { Body, Controller, Delete, Get, Param, Post, Req } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { parseInput } from "../../common/validation";
import { AuthService } from "../auth/auth.service";
import { Public } from "../auth/public.decorator";
import { bridgeFailureSchema, bridgeResultSchema, pairBridgeSchema } from "./local-bridge.contracts";
import { LocalBridgeService } from "./local-bridge.service";

@Controller("local-bridge")
export class LocalBridgeController {
  constructor(private readonly service: LocalBridgeService, private readonly auth: AuthService) {}
  @Public() @Post('comfy/register') async comfyRegister(@Req() r:FastifyRequest,@Body()body:unknown){return this.service.comfyRegister(r.headers.authorization,parseInput(registrySchema,body).nodes);}
  @Public() @Post('comfy/claim') async comfyClaim(@Req()r:FastifyRequest){return this.service.comfyClaim(r.headers.authorization);}
  @Public() @Post('comfy/jobs/:id/pulse') async comfyPulse(@Req()r:FastifyRequest,@Param('id')id:string){return this.service.comfyPulse(r.headers.authorization,id);}
  @Public() @Post('comfy/jobs/:id/progress') async comfyProgress(@Req()r:FastifyRequest,@Param('id')id:string,@Body()body:unknown){return this.service.comfyPulse(r.headers.authorization,id,parseInput(progressSchema,body));}
  @Public() @Post('comfy/jobs/:id/finish') async comfyFinish(@Req()r:FastifyRequest,@Param('id')id:string,@Body()body:unknown){return this.service.comfyFinish(r.headers.authorization,id,parseInput(finishSchema,body));}
  @Public() @Post('comfy/jobs/:id/preview') async comfyPreview(@Req()r:FastifyRequest,@Param('id')id:string){const part=await r.file({limits:{files:1,fileSize:10*1024*1024}});if(!part)throw new BadRequestException('需要预览图片');return this.service.comfyUpload(r.headers.authorization,id,part,true);}
  @Public() @Post('comfy/jobs/:id/artifacts') async comfyUpload(@Req()r:FastifyRequest,@Param('id')id:string){const part=await r.file({limits:{files:1,fileSize:10*1024*1024}});if(!part)throw new BadRequestException('需要一个产物文件');return this.service.comfyUpload(r.headers.authorization,id,part);}
  @Post("pair") async pair(@Req() request: FastifyRequest, @Body() body: unknown) { const input = parseInput(pairBridgeSchema, body) as { displayName: string; tokenDays: number }; return this.service.pair(await this.auth.getActor(request), input.displayName, input.tokenDays); }
  @Get("status") async status(@Req() request: FastifyRequest) { return this.service.status(await this.auth.getActor(request)); }
  @Delete(":deviceId") async revoke(@Req() request: FastifyRequest, @Param("deviceId") deviceId: string) { return this.service.revoke(await this.auth.getActor(request), deviceId); }
  @Public() @Post("heartbeat") async heartbeat(@Req() request: FastifyRequest) { return this.service.heartbeat(request.headers.authorization); }
  @Public() @Post("tasks/claim") async claim(@Req() request: FastifyRequest) { return this.service.claim(request.headers.authorization); }
  @Public() @Post("tasks/:runId/complete") async complete(@Req() request: FastifyRequest, @Param("runId") runId: string, @Body() body: unknown) { return this.service.complete(request.headers.authorization, runId, parseInput(bridgeResultSchema, body)); }
  @Public() @Post("tasks/:runId/fail") async fail(@Req() request: FastifyRequest, @Param("runId") runId: string, @Body() body: unknown) { return this.service.fail(request.headers.authorization, runId, parseInput(bridgeFailureSchema, body).reason); }
}
