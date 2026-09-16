import { Controller, ForbiddenException, Get, Req, ServiceUnavailableException } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { DatabaseService } from "../database/database.service";
import { AuthService } from "../auth/auth.service";
import { getEnvironment } from "../../common/environment";
import { caseUploadPolicy } from "../../common/upload-policy";
import { Public } from "../auth/public.decorator";

@Controller("health")
export class HealthController {
  constructor(private readonly database: DatabaseService, private readonly auth: AuthService) {}
  @Public()
  @Get()
  getHealth() {
    return { status: "ok", service: "artedu-api", now: new Date().toISOString() };
  }

  private async readiness() {
    const environment = getEnvironment();
    let database = false, uploads = !environment.fileUploadsEnabled;
    try {
      const result = await this.database.query("SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='works' AND column_name='story_json' AND table_schema='public') AND to_regclass('public.content_reports') IS NOT NULL AS ready");
      database = result.rows[0]?.ready === true;
    } catch { /* Never leak database addresses or connection errors. */ }
    if (environment.fileUploadsEnabled) {
      try { await access(environment.uploadRoot, constants.R_OK | constants.W_OK); uploads = true; } catch { /* Not ready. */ }
    }
    return { database, uploads, ready: database && uploads };
  }

  @Public()
  @Get('ready')
  async getReadiness() {
    if (!(await this.readiness()).ready) throw new ServiceUnavailableException('服务尚未就绪');
    return { status: 'ok', service: 'artedu-api' };
  }

  @Get('runtime')
  async getRuntime(@Req() request: FastifyRequest) {
    const actor = await this.auth.getActor(request);
    if (!actor.roles.some(role => ['admin', 'operator', 'teacher'].includes(role))) throw new ForbiddenException('仅管理工作台可查看运行状态');
    const env = getEnvironment();
    const safeLabel = (value: string | undefined, fallback: string) => value && /^[\p{L}\p{N} ._-]{1,64}$/u.test(value) ? value : fallback;
    return { ...await this.readiness(), environment: safeLabel(process.env.ARTEDU_ENV_LABEL, env.nodeEnv),
      version: safeLabel(process.env.ARTEDU_VERSION, '未标记'), localAuth: env.localAuthenticationEnabled,
      modelExecution: env.modelExecutionEnabled, uploadPolicy: caseUploadPolicy(), checkedAt: new Date().toISOString() };
  }
}
