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
const LOGIN_MAX_BUCKETS = 5_000;
const LOGIN_LIMITS = { ip: 20, account: 10, pair: 5 } as const;
const SESSION_COOKIE = "artedu_session";
// Used only to keep unsuccessful known-user and unknown-user logins on the same scrypt path.
const DUMMY_PASSWORD_HASH = "scrypt$16384$8$1$GEzVgoKrIbcz9dpikZUzAw$P3NldlRj199PM9pHqXaeo8VmnbqU2PJ2rOn_4F7RjsgdR_16UMm8vGc_JnrZ29jvDBOBETtwHjG2ggIQ7qyd4w";

type LoginBucketKey = keyof typeof LOGIN_LIMITS;

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
    const loginKeys = this.getLoginKeys(ip, input.username);
    this.assertLoginAllowed(loginKeys);

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
    const validPassword = await verifyLocalPassword(input.password, user?.password_hash ?? DUMMY_PASSWORD_HASH);
    if (!user || user.status !== "active" || !validPassword) {
      this.recordLoginFailure(loginKeys);
      throw new UnauthorizedException("用户名或密码错误");
    }

    this.clearLoginFailures(loginKeys);
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + environment.localSessionDays * 24 * 60 * 60 * 1000);
    await this.database.transaction(async (client) => {
      await client.query(
        "DELETE FROM auth_sessions WHERE expires_at <= CURRENT_TIMESTAMP OR last_seen_at <= CURRENT_TIMESTAMP - ($2 * INTERVAL '1 hour') OR user_id = $1",
        [user.id, environment.localSessionIdleHours],
      );
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
      WHERE session.token_hash = $1
        AND session.expires_at > CURRENT_TIMESTAMP
        AND session.last_seen_at > CURRENT_TIMESTAMP - ($2 * INTERVAL '1 hour')
      GROUP BY u.id
    `, [this.hashSessionToken(token), getEnvironment().localSessionIdleHours]);
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

  private getLoginKeys(ip: string, username: string) {
    const normalizedUsername = username.toLowerCase();
    return {
      ip: `ip:${ip}`,
      account: `account:${normalizedUsername}`,
      pair: `pair:${ip}:${normalizedUsername}`,
    } satisfies Record<LoginBucketKey, string>;
  }

  private assertLoginAllowed(keys: Record<LoginBucketKey, string>) {
    const now = Date.now();
    this.pruneLoginBuckets(now);
    for (const type of Object.keys(LOGIN_LIMITS) as LoginBucketKey[]) {
      const bucket = loginBuckets.get(keys[type]);
      if (bucket && bucket.failures >= LOGIN_LIMITS[type]) {
        throw new HttpException("登录尝试过于频繁，请稍后再试", HttpStatus.TOO_MANY_REQUESTS);
      }
    }
  }

  private recordLoginFailure(keys: Record<LoginBucketKey, string>) {
    const now = Date.now();
    this.pruneLoginBuckets(now);
    for (const type of Object.keys(LOGIN_LIMITS) as LoginBucketKey[]) {
      const key = keys[type];
      const existing = loginBuckets.get(key);
      if (!existing && loginBuckets.size >= LOGIN_MAX_BUCKETS) {
        throw new HttpException("登录尝试过于频繁，请稍后再试", HttpStatus.TOO_MANY_REQUESTS);
      }
      const bucket = !existing ? { failures: 0, resetAt: now + LOGIN_WINDOW_MS } : existing;
      bucket.failures += 1;
      loginBuckets.set(key, bucket);
    }
  }

  private clearLoginFailures(keys: Record<LoginBucketKey, string>) {
    for (const key of Object.values(keys)) loginBuckets.delete(key);
  }

  private pruneLoginBuckets(now: number) {
    for (const [key, bucket] of loginBuckets) if (bucket.resetAt <= now) loginBuckets.delete(key);
  }
}
