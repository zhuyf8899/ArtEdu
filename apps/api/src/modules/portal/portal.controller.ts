import { Controller, Get, Query, Req } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { parseInput } from "../../common/validation";
import { AuthService } from "../auth/auth.service";
import { portalSearchQuerySchema, type PortalSearchQuery } from "./portal.contracts";
import { PortalService } from "./portal.service";

@Controller("portal")
export class PortalController {
  constructor(
    private readonly authService: AuthService,
    private readonly portalService: PortalService,
  ) {}

  @Get("home")
  async getHome(@Req() request: FastifyRequest) {
    return this.portalService.getHome(await this.authService.getActor(request));
  }

  @Get("search")
  async search(@Req() request: FastifyRequest, @Query() query: unknown) {
    return this.portalService.search(
      await this.authService.getActor(request),
      parseInput(portalSearchQuerySchema, query) as PortalSearchQuery,
    );
  }
}
