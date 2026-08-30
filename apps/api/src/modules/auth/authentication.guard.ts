import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { FastifyRequest } from "fastify";
import { AuthService } from "./auth.service";
import { IS_PUBLIC_ENDPOINT } from "./public.decorator";

/** New endpoints are authenticated unless explicitly marked with @Public(). */
@Injectable()
export class AuthenticationGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_ENDPOINT, [context.getHandler(), context.getClass()])) {
      return true;
    }
    await this.authService.getActor(context.switchToHttp().getRequest<FastifyRequest>());
    return true;
  }
}
