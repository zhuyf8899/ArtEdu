import { ForbiddenException, HttpException, HttpStatus, Injectable, NotFoundException } from "@nestjs/common";
import type { PoolClient } from "pg";
import { MANAGED_QUOTA_CAPABILITY } from "../../common/constants";
import type { Actor } from "../auth/auth.service";
import { DatabaseService } from "../database/database.service";
import type { CreateGenerationJobInput } from "./generation.contracts";
import { GenerationRepository } from "./generation.repository";

interface QuotaRow {
  daily_limit: number | null;
  monthly_limit: number | null;
  concurrent_limit: number | null;
  daily_used: number;
  monthly_used: number;
  in_flight: number;
}

@Injectable()
export class GenerationService {
  constructor(
    private readonly database: DatabaseService,
    private readonly repository: GenerationRepository,
  ) {}

  async createJob(actor: Actor, input: CreateGenerationJobInput) {
    return this.database.transaction(async (client) => {
      // 同一用户的任务创建串行化，防止多标签页同时绕过额度检查。
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [actor.id]);
      const quota = await this.getQuotaSnapshot(client, actor.id);
      this.assertQuotaAvailable(quota);
      return this.repository.createQueuedJob(client, actor.id, input);
    });
  }

  async getJob(actor: Actor, jobId: string) {
    const job = await this.repository.getById(jobId);
    if (!job) throw new NotFoundException("生成任务不存在");
    const canReadAllJobs = actor.roles.some((role) => ["admin", "operator", "teacher"].includes(role));
    if (job.userId !== actor.id && !canReadAllJobs) throw new ForbiddenException("无权查看此生成任务");
    return job;
  }

  private async getQuotaSnapshot(client: PoolClient, userId: string): Promise<QuotaRow> {
    const result = await client.query<QuotaRow>(`
      WITH limits AS (
        SELECT
          MAX(limit_value) FILTER (WHERE period_type = 'daily') AS daily_limit,
          MAX(limit_value) FILTER (WHERE period_type = 'monthly') AS monthly_limit,
          MAX(limit_value) FILTER (WHERE period_type = 'concurrent') AS concurrent_limit
        FROM user_usage_limits
        WHERE user_id = $1 AND capability = $2 AND enabled = TRUE
      ), usage AS (
        SELECT
          COUNT(*) FILTER (
            WHERE created_at >= date_trunc('day', NOW())
              AND status IN ('queued', 'running', 'succeeded')
          )::int AS daily_used,
          COUNT(*) FILTER (
            WHERE created_at >= date_trunc('month', NOW())
              AND status IN ('queued', 'running', 'succeeded')
          )::int AS monthly_used,
          COUNT(*) FILTER (WHERE status IN ('queued', 'running'))::int AS in_flight
        FROM generation_jobs
        WHERE user_id = $1
      )
      SELECT
        limits.daily_limit,
        limits.monthly_limit,
        limits.concurrent_limit,
        usage.daily_used,
        usage.monthly_used,
        usage.in_flight
      FROM limits CROSS JOIN usage
    `, [userId, MANAGED_QUOTA_CAPABILITY]);
    return result.rows[0] ?? {
      daily_limit: null, monthly_limit: null, concurrent_limit: null,
      daily_used: 0, monthly_used: 0, in_flight: 0,
    };
  }

  private assertQuotaAvailable(quota: QuotaRow) {
    // 未配置的额度视为不限制；配置为 0 表示禁止创建新任务。
    if (quota.daily_limit !== null && quota.daily_used >= quota.daily_limit) {
      throw new HttpException("今日生成额度已用尽", HttpStatus.TOO_MANY_REQUESTS);
    }
    if (quota.monthly_limit !== null && quota.monthly_used >= quota.monthly_limit) {
      throw new HttpException("本月生成额度已用尽", HttpStatus.TOO_MANY_REQUESTS);
    }
    if (quota.concurrent_limit !== null && quota.in_flight >= quota.concurrent_limit) {
      throw new HttpException("同时运行的生成任务已达上限", HttpStatus.TOO_MANY_REQUESTS);
    }
  }
}
