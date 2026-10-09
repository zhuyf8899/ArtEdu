/**
 * 【认证守卫】请求进入业务接口前检查身份；标有 @Public() 的接口跳过此检查。认证解决“你是谁”，课程归属和管理员角色等授权解决“你能做什么”，由后续业务代码判断。
 */
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
