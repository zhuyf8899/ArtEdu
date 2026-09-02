import { Body, Controller, Get, Param, Post, Req } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { parseInput } from "../../common/validation";
import { AuthService } from "../auth/auth.service";
import { Public } from "../auth/public.decorator";
import { bridgeFailureSchema, bridgeResultSchema, pairBridgeSchema } from "./local-bridge.contracts";
import { LocalBridgeService } from "./local-bridge.service";

@Controller("local-bridge")
export class LocalBridgeController {
  constructor(private readonly service: LocalBridgeService, private readonly auth: AuthService) {}
  @Post("pair") async pair(@Req() request: FastifyRequest, @Body() body: unknown) { const input = parseInput(pairBridgeSchema, body) as { displayName: string }; return this.service.pair(await this.auth.getActor(request), input.displayName); }
  @Get("status") async status(@Req() request: FastifyRequest) { return this.service.status(await this.auth.getActor(request)); }
  @Public() @Post("heartbeat") async heartbeat(@Req() request: FastifyRequest) { return this.service.heartbeat(request.headers.authorization); }
  @Public() @Post("tasks/claim") async claim(@Req() request: FastifyRequest) { return this.service.claim(request.headers.authorization); }
  @Public() @Post("tasks/:runId/complete") async complete(@Req() request: FastifyRequest, @Param("runId") runId: string, @Body() body: unknown) { return this.service.complete(request.headers.authorization, runId, parseInput(bridgeResultSchema, body)); }
  @Public() @Post("tasks/:runId/fail") async fail(@Req() request: FastifyRequest, @Param("runId") runId: string, @Body() body: unknown) { return this.service.fail(request.headers.authorization, runId, parseInput(bridgeFailureSchema, body).reason); }
}
