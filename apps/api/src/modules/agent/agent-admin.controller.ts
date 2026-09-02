import { Controller, Get, Req } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { AuthService } from "../auth/auth.service";
import { AgentService } from "./agent.service";

@Controller("admin/agent-alerts")
export class AgentAdminController {
  constructor(private readonly agents: AgentService, private readonly auth: AuthService) {}

  @Get()
  async listOpenAlerts(@Req() request: FastifyRequest) {
    return this.agents.listOpenAlerts(await this.auth.getActor(request));
  }
}
