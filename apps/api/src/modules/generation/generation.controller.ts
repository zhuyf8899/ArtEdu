import { Body, Controller, Get, Param, Post, Req, Res } from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import { parseInput } from "../../common/validation";
import { AuthService } from "../auth/auth.service";
import { createGenerationJobSchema, runGenerationJobSchema } from "./generation.contracts";
import { GenerationService } from "./generation.service";

@Controller("generation-jobs")
export class GenerationController {
  constructor(
    private readonly authService: AuthService,
    private readonly generationService: GenerationService,
  ) {}

  @Post()
  async createJob(@Req() request: FastifyRequest, @Body() body: unknown) {
    const actor = await this.authService.getActor(request);
    const input = parseInput(createGenerationJobSchema, body);
    return this.generationService.createJob(actor, {
      ...input,
      context: input.context ?? [],
      parameters: input.parameters ?? {},
    });
  }

  @Post("run")
  async runJob(@Req() request: FastifyRequest, @Body() body: unknown) {
    const actor = await this.authService.getActor(request);
    const input = parseInput(runGenerationJobSchema, body);
    return this.generationService.runJob(actor, { ...input, context: input.context ?? [], parameters: input.parameters ?? {} });
  }

  @Get(":jobId")
  async getJob(@Req() request: FastifyRequest, @Param("jobId") jobId: string) {
    const actor = await this.authService.getActor(request);
    return this.generationService.getJob(actor, jobId);
  }

  @Get(":jobId/download")
  async downloadOutput(@Req() request: FastifyRequest, @Param("jobId") jobId: string, @Res({ passthrough: true }) reply: FastifyReply) {
    const actor = await this.authService.getActor(request);
    const { output, data } = await this.generationService.downloadOutput(actor, jobId);
    const extension = output.mimeType.includes("presentation") ? "pptx" : "docx";
    reply.header("Content-Type", output.mimeType);
    reply.header("Content-Disposition", `attachment; filename=artedu-${jobId.slice(0, 8)}.${extension}`);
    reply.header("Cache-Control", "private, no-store");
    return data;
  }
}
