import { Body, Controller, Get, Param, Patch, Post, Put, Query, Req } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { parseInput } from "../../common/validation";
import { AuthService } from "../auth/auth.service";
import {
  accountStatusSchema,
  bulkQuotaSchema,
  listUsersQuerySchema,
  quotaSchema,
  reviewDecisionSchema,
  reportDecisionSchema,
} from "./admin.contracts";
import { AdminService } from "./admin.service";

@Controller("admin")
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly authService: AuthService,
  ) {}

  @Get("dashboard")
  async getDashboard(@Req() request: FastifyRequest) {
    const actor = await this.authService.getActor(request);
    return this.adminService.getDashboard(actor);
  }

  @Get("users")
  async getUsers(@Req() request: FastifyRequest, @Query() query: unknown) {
    const actor = await this.authService.getActor(request);
    return this.adminService.getUsers(actor, parseInput(listUsersQuerySchema, query));
  }

  @Put("users/:userId/quota")
  async updateQuota(
    @Req() request: FastifyRequest,
    @Param("userId") userId: string,
    @Body() body: unknown,
  ) {
    const actor = await this.authService.getActor(request);
    return this.adminService.updateQuota(actor, userId, parseInput(quotaSchema, body));
  }

  @Post("users/quota/bulk")
  async updateBulkQuota(@Req() request: FastifyRequest, @Body() body: unknown) {
    const actor = await this.authService.getActor(request);
    return this.adminService.updateBulkQuota(actor, parseInput(bulkQuotaSchema, body));
  }

  @Patch("users/:userId/status")
  async updateAccountStatus(
    @Req() request: FastifyRequest,
    @Param("userId") userId: string,
    @Body() body: unknown,
  ) {
    const actor = await this.authService.getActor(request);
    return this.adminService.updateAccountStatus(actor, userId, parseInput(accountStatusSchema, body).status);
  }

  @Get("reviews")
  async getReviews(@Req() request: FastifyRequest) {
    const actor = await this.authService.getActor(request);
    return this.adminService.getReviews(actor);
  }

  @Post("reviews/:reviewId/decision")
  async decideReview(
    @Req() request: FastifyRequest,
    @Param("reviewId") reviewId: string,
    @Body() body: unknown,
  ) {
    const actor = await this.authService.getActor(request);
    const decision = parseInput(reviewDecisionSchema, body);
    return this.adminService.decideReview(actor, reviewId, {
      ...decision,
      note: decision.note ?? "",
    });
  }

  @Get("reports")
  async getReports(@Req() request: FastifyRequest) {
    return this.adminService.getReports(await this.authService.getActor(request));
  }

  @Post("reports/:reportId/decision")
  async decideReport(@Req() request: FastifyRequest, @Param("reportId") reportId: string, @Body() body: unknown) {
    const decision = parseInput(reportDecisionSchema, body);
    return this.adminService.decideReport(await this.authService.getActor(request), reportId, { status: decision.status, contentAction: decision.contentAction ?? "keep", note: decision.note ?? "" });
  }
}
