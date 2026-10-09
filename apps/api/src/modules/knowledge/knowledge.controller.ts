import { Body, Controller, Get, Param, Patch, Post, Put, Req } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { parseInput } from "../../common/validation";
import { AuthService } from "../auth/auth.service";
import { activityInputSchema, goalInputSchema, goalUpdateSchema, nodeInputSchema, nodeLinksSchema, nodeUpdateSchema, toolUsageInputSchema, learningPathInputSchema } from "./knowledge.contracts";
import type { ActivityInput, GoalInput, NodeInput } from "./knowledge.contracts";
import { KnowledgeService } from "./knowledge.service";

@Controller()
export class KnowledgeController {
  constructor(private readonly auth: AuthService, private readonly knowledge: KnowledgeService) {}

  @Get("me/knowledge-map")
  async map(@Req() request: FastifyRequest) { return this.knowledge.getMap(await this.auth.getActor(request)); }

  @Get("me/ability-portrait")
  async abilities(@Req() request: FastifyRequest) { return this.knowledge.getAbilities(await this.auth.getActor(request)); }

  @Get("me/tool-trail")
  async tools(@Req() request: FastifyRequest) { return this.knowledge.getToolTrail(await this.auth.getActor(request)); }

  @Get("me/growth-record")
  async growth(@Req() request: FastifyRequest) { return this.knowledge.getGrowth(await this.auth.getActor(request)); }

  @Post("me/knowledge-activities")
  async record(@Req() request: FastifyRequest, @Body() body: unknown) {
    return this.knowledge.recordActivity(await this.auth.getActor(request), parseInput(activityInputSchema, body) as ActivityInput);
  }

  @Post("me/tool-usage")
  async recordToolUsage(@Req() request: FastifyRequest, @Body() body: unknown) {
    return this.knowledge.recordToolUsage(await this.auth.getActor(request), parseInput(toolUsageInputSchema, body).toolId);
  }

  @Put("me/knowledge-path")
  async savePath(@Req() request: FastifyRequest, @Body() body: unknown) {
    return this.knowledge.savePath(await this.auth.getActor(request), parseInput(learningPathInputSchema, body));
  }

  @Post("admin/knowledge-map/sync-labels")
  async sync(@Req() request: FastifyRequest) { return this.knowledge.syncLabels(await this.auth.getActor(request)); }

  @Get("admin/knowledge-map")
  async manage(@Req() request: FastifyRequest) { return this.knowledge.getManagedMap(await this.auth.getActor(request)); }

  @Post("admin/knowledge-nodes")
  async createNode(@Req() request: FastifyRequest, @Body() body: unknown) {
    return this.knowledge.createNode(await this.auth.getActor(request), parseInput(nodeInputSchema, body) as NodeInput);
  }

  @Patch("admin/knowledge-nodes/:nodeId")
  async updateNode(@Req() request: FastifyRequest, @Param("nodeId") nodeId: string, @Body() body: unknown) {
    return this.knowledge.updateNode(await this.auth.getActor(request), nodeId, parseInput(nodeUpdateSchema, body));
  }

  @Put("admin/knowledge-nodes/:nodeId/links")
  async setLinks(@Req() request: FastifyRequest, @Param("nodeId") nodeId: string, @Body() body: unknown) {
    return this.knowledge.setLinks(await this.auth.getActor(request), nodeId, parseInput(nodeLinksSchema, body));
  }

  @Post("admin/ability-goals")
  async createGoal(@Req() request: FastifyRequest, @Body() body: unknown) {
    return this.knowledge.createGoal(await this.auth.getActor(request), parseInput(goalInputSchema, body) as GoalInput);
  }

  @Patch("admin/ability-goals/:goalId")
  async updateGoal(@Req() request: FastifyRequest, @Param("goalId") goalId: string, @Body() body: unknown) {
    return this.knowledge.updateGoal(await this.auth.getActor(request), goalId, parseInput(goalUpdateSchema, body));
  }
}
