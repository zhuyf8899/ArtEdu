import { Controller, Get, Inject, Req } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { AuthService } from "../auth/auth.service";
import { PortalService } from "./portal.service";

@Controller("portal")
export class PortalController {
  constructor(
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(PortalService) private readonly portalService: PortalService,
  ) {}

  @Get("home")
  async getHome(@Req() request: FastifyRequest) {
    return this.portalService.getHome(await this.authService.getActor(request));
  }
}
