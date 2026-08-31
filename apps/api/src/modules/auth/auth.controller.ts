import { Body, Controller, Get, Post, Req, Res } from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import { parseInput } from "../../common/validation";
import { localLoginSchema } from "./auth.contracts";
import { Public } from "./public.decorator";
import { AuthService } from "./auth.service";

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get("me")
  getCurrentUser(@Req() request: FastifyRequest) {
    return this.authService.getActor(request);
  }

  @Public()
  @Post("login")
  async login(@Req() request: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply, @Body() body: unknown) {
    const login = await this.authService.loginLocal(parseInput(localLoginSchema, body), request.ip);
    reply.header("Set-Cookie", this.authService.getSessionCookie(login.token, login.expiresAt));
    return login.actor;
  }

  @Post("logout")
  async logout(@Req() request: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    await this.authService.logout(request);
    reply.header("Set-Cookie", this.authService.clearSessionCookie());
    return { ok: true };
  }
}
