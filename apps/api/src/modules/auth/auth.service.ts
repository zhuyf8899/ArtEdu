import { ForbiddenException, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { DatabaseService } from "../database/database.service";

export interface Actor {
  id: string;
  username: string;
  displayName: string;
  accountStatus: "active" | "disabled" | "pending";
  roles: string[];
}

interface ActorRow {
  id: string;
  username: string;
  display_name: string;
  status: Actor["accountStatus"];
  roles: string[] | null;
}

@Injectable()
export class AuthService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async getActor(request: FastifyRequest): Promise<Actor> {
    const userId = this.getDevelopmentUserId(request);

    if (!userId) {
      throw new UnauthorizedException("缺少登录会话。请通过学校 SSO 登录。");
    }

    const result = await this.database.query<ActorRow>(`
      SELECT
        u.id,
        u.username,
        u.display_name,
        u.status,
        COALESCE(array_remove(array_agg(r.name), NULL), '{}') AS roles
      FROM users u
      LEFT JOIN user_roles ur ON ur.user_id = u.id
      LEFT JOIN roles r ON r.id = ur.role_id
      WHERE u.id = $1
      GROUP BY u.id
    `, [userId]);

    const user = result.rows[0];
    if (!user) throw new UnauthorizedException("登录用户不存在");
    if (user.status !== "active") throw new ForbiddenException("当前账户不可用");

    return {
      id: user.id,
      username: user.username,
      displayName: user.display_name,
      accountStatus: user.status,
      roles: user.roles ?? [],
    };
  }

  requireAnyRole(actor: Actor, allowedRoles: readonly string[]) {
    if (!actor.roles.some((role) => allowedRoles.includes(role))) {
      throw new ForbiddenException("当前角色无权执行此操作");
    }
  }

  private getDevelopmentUserId(request: FastifyRequest) {
    if (process.env.ENABLE_DEVELOPMENT_AUTH !== "true" || process.env.NODE_ENV === "production") {
      return undefined;
    }

    const headerValue = request.headers["x-user-id"];
    const headerUserId = Array.isArray(headerValue) ? headerValue[0] : headerValue;
    return headerUserId ?? process.env.DEV_ADMIN_USER_ID;
  }
}
