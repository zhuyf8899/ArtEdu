import { Controller, Get, Inject, Req } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { AuthService } from "./auth.service";

@Controller("auth")
export class AuthController {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  @Get("me")
  getCurrentUser(@Req() request: FastifyRequest) {
    // TODO: 生产环境接入学校 SSO/OIDC；当前仅允许开发环境使用 x-user-id。
    return this.authService.getActor(request);
  }
}
