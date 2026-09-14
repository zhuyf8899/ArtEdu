import { Body, Controller, Get, Param, Post, Req, Res } from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import { parseInput } from "../../common/validation";
import { AuthService } from "../auth/auth.service";
import { createAgentRunSchema, executeAgentRunSchema, type CreateAgentRunInput, type ExecuteAgentRunInput } from "./agent.contracts";
import { AgentHarnessService } from "./agent-harness.service";
import { AgentService } from "./agent.service";

@Controller("agent-runs")
export class AgentController {
  constructor(private readonly agents: AgentService, private readonly harness: AgentHarnessService, private readonly auth: AuthService) {}

  @Post()
  async create(@Req() request: FastifyRequest, @Body() body: CreateAgentRunInput) {
    const input = parseInput(createAgentRunSchema, body);
    return this.agents.createRun(await this.auth.getActor(request), { ...input, parameters: input.parameters ?? {} });
  }

  @Get("me")
  async listMine(@Req() request: FastifyRequest) {
    return this.agents.listMyRuns(await this.auth.getActor(request));
  }

  @Post(":runId/execute")
  async execute(@Req() request: FastifyRequest, @Param("runId") runId: string, @Body() body: unknown) {
    const input = parseInput(executeAgentRunSchema, body) as ExecuteAgentRunInput;
    return this.harness.execute(await this.auth.getActor(request), runId, input);
  }

  @Get(":runId")
  async get(@Req() request: FastifyRequest, @Param("runId") runId: string) {
    return this.agents.getRun(await this.auth.getActor(request), runId);
  }

  @Get(":runId/artifacts/:artifactId/download")
  async downloadArtifact(@Req() request: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply, @Param("runId") runId: string, @Param("artifactId") artifactId: string) {
    const artifact = await this.agents.readArtifact(await this.auth.getActor(request), runId, artifactId);
    reply.header("Content-Type", "application/json; charset=utf-8");
    reply.header("Content-Disposition", `attachment; filename=artedu-${artifactId.slice(-12)}.json`);
    reply.header("Cache-Control", "private, no-store");
    return artifact.data;
  }
}
