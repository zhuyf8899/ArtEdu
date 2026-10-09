import { ComfyService } from '../studio/comfy.service';
import type { MultipartFile } from '@fastify/multipart';
import { ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { DatabaseService } from "../database/database.service";
import type { Actor } from "../auth/auth.service";
import { AgentService } from "../agent/agent.service";
import { getEnvironment } from "../../common/environment";

interface DeviceRow { id: string; user_id: string; status: "active" | "revoked"; expires_at: Date; }

@Injectable()
export class LocalBridgeService {
  constructor(private readonly database: DatabaseService, private readonly agents: AgentService, private readonly comfy: ComfyService) {}
  async pair(actor: Actor, displayName: string, requestedTokenDays: number) {
    const token = randomBytes(32).toString("base64url");
    const deviceId = `bridge-${randomUUID()}`;
    // 用户能缩短自己的令牌，但不能用前端参数绕过部署方设置的最长有效期。
    const tokenDays = Math.min(requestedTokenDays, getEnvironment().localBridgeTokenDays);
    const expiresAt = new Date(Date.now() + tokenDays * 24 * 60 * 60 * 1000);
    await this.database.query(`INSERT INTO local_bridge_devices (id,user_id,display_name,token_hash,expires_at) VALUES ($1,$2,$3,$4,$5)`, [deviceId, actor.id, displayName, this.hash(token), expiresAt]);
    return { deviceId, token, tokenDays, expiresAt: expiresAt.toISOString(), warning: "配对令牌仅本次返回；请立即交给本地 Bridge，勿保存到云端或截图分享。" };
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
  async comfyRegister(authorization:string|undefined,nodes:Record<string,any>){const d=await this.authenticate(authorization);await this.touch(d.id);return this.comfy.register(d,nodes);}
  async comfyClaim(authorization:string|undefined){const d=await this.authenticate(authorization);await this.touch(d.id);return this.comfy.claim(d);}
  async comfyPulse(authorization:string|undefined,id:string,progress?:Record<string,any>){const d=await this.authenticate(authorization);await this.touch(d.id);return this.comfy.pulse(d,id,progress);}
  async comfyFinish(authorization:string|undefined,id:string,input:{status:string;error?:string}){const d=await this.authenticate(authorization);return this.comfy.finish(d,id,input);}
  async comfyUpload(authorization:string|undefined,id:string,part:MultipartFile,preview=false){const d=await this.authenticate(authorization);return this.comfy.upload(d,id,part,preview);}
  private async authenticate(authorization?: string) {
    const token = authorization?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1];
    if (!token) throw new UnauthorizedException("缺少有效本地 Bridge 令牌");
    const result = await this.database.query<DeviceRow>("SELECT d.id,d.user_id,d.status,d.expires_at FROM local_bridge_devices d JOIN users u ON u.id=d.user_id WHERE d.token_hash=$1 AND d.status='active' AND d.expires_at>CURRENT_TIMESTAMP AND u.status='active'", [this.hash(token)]);
    const device = result.rows[0];
    if (!device) throw new ForbiddenException("本地 Bridge 未配对、已过期或已撤销");
    return device;
  }
  private async touch(deviceId: string) { await this.database.query("UPDATE local_bridge_devices SET last_seen_at=CURRENT_TIMESTAMP WHERE id=$1", [deviceId]); }
  private hash(token: string) { return createHash("sha256").update(token).digest("base64url"); }
}
