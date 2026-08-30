import { Body, Controller, Get, Inject, Param, Post, Req } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { parseInput } from "../../common/validation";
import { AuthService } from "../auth/auth.service";
import { createGenerationJobSchema } from "./generation.contracts";
import { GenerationService } from "./generation.service";

@Controller("generation-jobs")
export class GenerationController {
  constructor(
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(GenerationService) private readonly generationService: GenerationService,
  ) {}

  @Post()
  async createJob(@Req() request: FastifyRequest, @Body() body: unknown) {
    const actor = await this.authService.getActor(request);
    const input = parseInput(createGenerationJobSchema, body);
    return this.generationService.createJob(actor, {
      ...input,
      parameters: input.parameters ?? {},
    });
  }

  @Get(":jobId")
  async getJob(@Req() request: FastifyRequest, @Param("jobId") jobId: string) {
    const actor = await this.authService.getActor(request);
    return this.generationService.getJob(actor, jobId);
  }
}
