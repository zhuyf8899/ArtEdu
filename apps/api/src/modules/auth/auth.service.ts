import { ForbiddenException, HttpException, HttpStatus, Injectable, UnauthorizedException } from "@nestjs/common";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { FastifyRequest } from "fastify";
import { getEnvironment } from "../../common/environment";
import { DatabaseService } from "../database/database.service";
import type { LocalLoginInput } from "./auth.contracts";
import { verifyLocalPassword } from "./password";

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

interface LocalIdentityRow extends ActorRow {
  password_hash: string;
}

interface LoginBucket { failures: number; resetAt: number; }
const loginBuckets = new Map<string, LoginBucket>();
const LOGIN_WINDOW_MS = 15 * 60_000;
const LOGIN_MAX_FAILURES = 5;
const SESSION_COOKIE = "artedu_session";

@Injectable()
export class AuthService {
  constructor(private readonly database: DatabaseService) {}

  async getActor(request: FastifyRequest): Promise<Actor> {
    const cachedActor = (request as FastifyRequest & { actor?: Actor }).actor;
    if (cachedActor) return cachedActor;
    const sessionActor = await this.getSessionActor(request);
    if (sessionActor) return this.cacheActor(request, sessionActor);
    throw new UnauthorizedException("缺少有效登录会话。");
  }

  async loginLocal(input: LocalLoginInput, ip: string) {
    const environment = getEnvironment();
    if (!environment.localAuthenticationEnabled) throw new ForbiddenException("本地账号登录未启用");
    const loginKey = `${ip}:${input.username.toLowerCase()}`;
    this.assertLoginAllowed(loginKey);

    const result = await this.database.query<LocalIdentityRow>(`
      SELECT
        u.id,
        u.username,
        u.display_name,
        u.status,
        COALESCE(array_remove(array_agg(r.name), NULL), '{}') AS roles,
        identity.password_hash
      FROM user_identities identity
      JOIN users u ON u.id = identity.user_id
      LEFT JOIN user_roles ur ON ur.user_id = u.id
      LEFT JOIN roles r ON r.id = ur.role_id
      WHERE identity.provider = 'local' AND identity.external_subject = $1
      GROUP BY u.id, identity.password_hash
    `, [input.username]);

    const user = result.rows[0];
    const validPassword = user ? await verifyLocalPassword(input.password, user.password_hash) : false;
    if (!user || user.status !== "active" || !validPassword) {
      this.recordLoginFailure(loginKey);
      throw new UnauthorizedException("用户名或密码错误");
    }

    loginBuckets.delete(loginKey);
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + environment.localSessionDays * 24 * 60 * 60 * 1000);
    await this.database.transaction(async (client) => {
      await client.query("DELETE FROM auth_sessions WHERE expires_at <= CURRENT_TIMESTAMP OR user_id = $1", [user.id]);
      await client.query(`
        INSERT INTO auth_sessions (id,user_id,token_hash,expires_at)
        VALUES ($1,$2,$3,$4)
      `, [randomUUID(), user.id, this.hashSessionToken(token), expiresAt]);
    });

    return { actor: this.toActor(user), token, expiresAt };
  }

  async logout(request: FastifyRequest) {
    const token = this.getCookie(request, SESSION_COOKIE);
    if (token) await this.database.query("DELETE FROM auth_sessions WHERE token_hash = $1", [this.hashSessionToken(token)]);
  }

  getSessionCookie(token: string, expiresAt: Date) {
    const secure = getEnvironment().nodeEnv === "production" ? "; Secure" : "";
    return `${SESSION_COOKIE}=${token}; Path=/api; HttpOnly; SameSite=Lax; Max-Age=${Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000))}${secure}`;
  }

  clearSessionCookie() {
    const secure = getEnvironment().nodeEnv === "production" ? "; Secure" : "";
    return `${SESSION_COOKIE}=; Path=/api; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
  }

  private async getSessionActor(request: FastifyRequest) {
    if (!getEnvironment().localAuthenticationEnabled) return undefined;
    const token = this.getCookie(request, SESSION_COOKIE);
    if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return undefined;
    const result = await this.database.query<ActorRow>(`
      SELECT u.id,u.username,u.display_name,u.status,
        COALESCE(array_remove(array_agg(r.name), NULL), '{}') AS roles
      FROM auth_sessions session
      JOIN users u ON u.id = session.user_id
      LEFT JOIN user_roles ur ON ur.user_id = u.id
      LEFT JOIN roles r ON r.id = ur.role_id
      WHERE session.token_hash = $1 AND session.expires_at > CURRENT_TIMESTAMP
      GROUP BY u.id
    `, [this.hashSessionToken(token)]);
    const user = result.rows[0];
    if (!user) return undefined;
    if (user.status !== "active") throw new ForbiddenException("当前账户不可用");
    await this.database.query("UPDATE auth_sessions SET last_seen_at = CURRENT_TIMESTAMP WHERE token_hash = $1", [this.hashSessionToken(token)]);
    return this.toActor(user);
  }

  private toActor(user: ActorRow): Actor {
    return {
      id: user.id,
      username: user.username,
      displayName: user.display_name,
      accountStatus: user.status,
      roles: user.roles ?? [],
    };
  }

  private cacheActor(request: FastifyRequest, actor: Actor) {
    (request as FastifyRequest & { actor?: Actor }).actor = actor;
    return actor;
  }

  requireAnyRole(actor: Actor, allowedRoles: readonly string[]) {
    if (!actor.roles.some((role) => allowedRoles.includes(role))) {
      throw new ForbiddenException("当前角色无权执行此操作");
    }
  }

  private getCookie(request: FastifyRequest, name: string) {
    const cookieHeader = request.headers.cookie;
    if (!cookieHeader) return undefined;
    return cookieHeader.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1);
  }

  private hashSessionToken(token: string) {
    return createHash("sha256").update(token).digest("base64url");
  }

  private assertLoginAllowed(key: string) {
    const bucket = loginBuckets.get(key);
    if (bucket && bucket.resetAt > Date.now() && bucket.failures >= LOGIN_MAX_FAILURES) {
      throw new HttpException("登录尝试过于频繁，请稍后再试", HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  private recordLoginFailure(key: string) {
    const now = Date.now();
    const existing = loginBuckets.get(key);
    const bucket = !existing || existing.resetAt <= now ? { failures: 0, resetAt: now + LOGIN_WINDOW_MS } : existing;
    bucket.failures += 1;
    loginBuckets.set(key, bucket);
  }
}
