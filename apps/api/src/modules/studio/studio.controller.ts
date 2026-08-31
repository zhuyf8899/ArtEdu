import { Body, Controller, Get, Param, Patch, Post, Query, Req } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { parseInput } from "../../common/validation";
import { AuthService } from "../auth/auth.service";
import {
  catalogQuerySchema,
  commentInputSchema,
  workflowInputSchema,
  workflowRunInputSchema,
  workflowRunProgressSchema,
  workflowVersionInputSchema,
  workInputSchema,
} from "./studio.contracts";
import type {
  CatalogQuery, WorkflowInput, WorkflowRunInput, WorkflowRunProgressInput,
  WorkflowVersionInput, WorkInput,
} from "./studio.contracts";
import { StudioService } from "./studio.service";

@Controller()
export class StudioController {
  constructor(private readonly auth: AuthService, private readonly studio: StudioService) {}

  @Get("workflows")
  listWorkflows(@Query() query: unknown) {
    return this.studio.listWorkflows(parseInput(catalogQuerySchema, query) as CatalogQuery);
  }

  @Get("workflows/:workflowId")
  getWorkflow(@Param("workflowId") workflowId: string) {
    return this.studio.getWorkflow(workflowId);
  }

  @Post("workflows")
  async createWorkflow(@Req() request: FastifyRequest, @Body() body: unknown) {
    return this.studio.createWorkflow(await this.auth.getActor(request), parseInput(workflowInputSchema, body) as WorkflowInput);
  }

  @Post("workflows/:workflowId/versions")
  async createWorkflowVersion(@Req() request: FastifyRequest, @Param("workflowId") workflowId: string, @Body() body: unknown) {
    return this.studio.createWorkflowVersion(await this.auth.getActor(request), workflowId, parseInput(workflowVersionInputSchema, body) as WorkflowVersionInput);
  }

  @Post("workflows/:workflowId/runs")
  async startWorkflow(@Req() request: FastifyRequest, @Param("workflowId") workflowId: string, @Body() body: unknown) {
    return this.studio.startWorkflow(await this.auth.getActor(request), workflowId, parseInput(workflowRunInputSchema, body) as WorkflowRunInput);
  }

  @Get("me/workflow-runs")
  async listMyRuns(@Req() request: FastifyRequest) {
    return this.studio.listMyRuns(await this.auth.getActor(request));
  }

  @Patch("workflow-runs/:runId/progress")
  async updateRun(@Req() request: FastifyRequest, @Param("runId") runId: string, @Body() body: unknown) {
    return this.studio.updateRun(await this.auth.getActor(request), runId, parseInput(workflowRunProgressSchema, body) as WorkflowRunProgressInput);
  }

  @Get("works")
  async listWorks(@Req() request: FastifyRequest, @Query() query: unknown) {
    return this.studio.listWorks(await this.auth.getActor(request), parseInput(catalogQuerySchema, query) as CatalogQuery);
  }

  @Get("me/works")
  async listMyWorks(@Req() request: FastifyRequest) {
    return this.studio.listMyWorks(await this.auth.getActor(request));
  }

  @Get("works/:workId")
  async getWork(@Req() request: FastifyRequest, @Param("workId") workId: string) {
    return this.studio.getWork(await this.auth.getActor(request), workId);
  }

  @Post("works")
  async createWork(@Req() request: FastifyRequest, @Body() body: unknown) {
    return this.studio.createWork(await this.auth.getActor(request), parseInput(workInputSchema, body) as WorkInput);
  }

  @Post("works/:workId/submit")
  async submitWork(@Req() request: FastifyRequest, @Param("workId") workId: string) {
    return this.studio.submitWork(await this.auth.getActor(request), workId);
  }

  @Post("works/:workId/comments")
  async addComment(@Req() request: FastifyRequest, @Param("workId") workId: string, @Body() body: unknown) {
    const input = parseInput(commentInputSchema, body);
    return this.studio.addComment(await this.auth.getActor(request), workId, input.content);
  }

  @Post("works/:workId/like")
  async toggleLike(@Req() request: FastifyRequest, @Param("workId") workId: string) {
    return this.studio.toggleReaction(await this.auth.getActor(request), workId, "like");
  }

  @Post("works/:workId/favorite")
  async toggleFavorite(@Req() request: FastifyRequest, @Param("workId") workId: string) {
    return this.studio.toggleReaction(await this.auth.getActor(request), workId, "favorite");
  }
}
