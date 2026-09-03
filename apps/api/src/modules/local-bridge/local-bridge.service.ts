import { ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { DatabaseService } from "../database/database.service";
import type { Actor } from "../auth/auth.service";
import { AgentService } from "../agent/agent.service";
import { getEnvironment } from "../../common/environment";

interface DeviceRow { id: string; user_id: string; status: "active" | "revoked"; expires_at: Date; }

@Injectable()
export class LocalBridgeService {
  constructor(private readonly database: DatabaseService, private readonly agents: AgentService) {}
  async pair(actor: Actor, displayName: string) {
    const token = randomBytes(32).toString("base64url");
    const deviceId = `bridge-${randomUUID()}`;
    const expiresAt = new Date(Date.now() + getEnvironment().localBridgeTokenDays * 24 * 60 * 60 * 1000);
    await this.database.query(`INSERT INTO local_bridge_devices (id,user_id,display_name,token_hash,expires_at) VALUES ($1,$2,$3,$4,$5)`, [deviceId, actor.id, displayName, this.hash(token), expiresAt]);
    return { deviceId, token, warning: "配对令牌仅本次返回；请立即交给本地 Bridge，勿保存到云端或截图分享。" };
  }
  async claim(authorization?: string) {
    const device = await this.authenticate(authorization);
    await this.touch(device.id);
    return this.agents.claimNextForLocalBridge(device.user_id);
  }
  async heartbeat(authorization?: string) { const device = await this.authenticate(authorization); await this.touch(device.id); return { ok: true, deviceId: device.id }; }
  async status(actor: Actor) {
    const result = await this.database.query<{ id: string; display_name: string; last_seen_at: Date | null; expires_at: Date }>("SELECT id,display_name,last_seen_at,expires_at FROM local_bridge_devices WHERE user_id=$1 AND status='active' AND expires_at>CURRENT_TIMESTAMP ORDER BY created_at DESC", [actor.id]);
    const now = Date.now();
    return { items: result.rows.map((row) => ({ id: row.id, displayName: row.display_name, lastSeenAt: row.last_seen_at?.toISOString() ?? null, expiresAt: row.expires_at.toISOString(), status: row.last_seen_at && now - row.last_seen_at.getTime() <= 45_000 ? "online" : "offline" })) };
  }
  async revoke(actor: Actor, deviceId: string) {
    const result = await this.database.query<{ id: string }>("UPDATE local_bridge_devices SET status='revoked',revoked_at=CURRENT_TIMESTAMP WHERE id=$1 AND user_id=$2 AND status='active' RETURNING id", [deviceId, actor.id]);
    if (!result.rows[0]) throw new NotFoundException("本地 Bridge 不存在或已撤销");
    return { ok: true, deviceId };
  }
  async complete(authorization: string | undefined, runId: string, input: { providerId: string; model: string; content: string }) {
    const device = await this.authenticate(authorization);
    return this.agents.completeFromLocalBridge(device.user_id, runId, input.content, input.providerId, input.model);
  }
  async fail(authorization: string | undefined, runId: string, reason: string) {
    const device = await this.authenticate(authorization);
    return this.agents.failFromLocalBridge(device.user_id, runId, reason);
  }
  private async authenticate(authorization?: string) {
    const token = authorization?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1];
    if (!token) throw new UnauthorizedException("缺少有效本地 Bridge 令牌");
    const result = await this.database.query<DeviceRow>("SELECT id,user_id,status,expires_at FROM local_bridge_devices WHERE token_hash=$1 AND status='active' AND expires_at>CURRENT_TIMESTAMP", [this.hash(token)]);
    const device = result.rows[0];
    if (!device) throw new ForbiddenException("本地 Bridge 未配对、已过期或已撤销");
    return device;
  }
  private async touch(deviceId: string) { await this.database.query("UPDATE local_bridge_devices SET last_seen_at=CURRENT_TIMESTAMP WHERE id=$1", [deviceId]); }
  private hash(token: string) { return createHash("sha256").update(token).digest("base64url"); }
}
