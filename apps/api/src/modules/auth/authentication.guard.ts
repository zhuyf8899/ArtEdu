import { CanActivate, ExecutionContext, Inject, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { FastifyRequest } from "fastify";
import { AuthService } from "./auth.service";
import { IS_PUBLIC_ENDPOINT } from "./public.decorator";

/**
 * New endpoints are authenticated by default. Anonymous access must be marked
 * explicitly with @Public(), which keeps future controller additions safe.
 */
@Injectable()
export class AuthenticationGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(AuthService) private readonly authService: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_ENDPOINT, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    await this.authService.getActor(context.switchToHttp().getRequest<FastifyRequest>());
    return true;
  }
}
