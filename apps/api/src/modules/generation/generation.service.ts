import { ForbiddenException, HttpException, HttpStatus, Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import type { PoolClient } from "pg";
import { MANAGED_QUOTA_CAPABILITY } from "../../common/constants";
import { getEnvironment } from "../../common/environment";
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
    if (!getEnvironment().modelExecutionEnabled) {
      throw new ServiceUnavailableException("模型执行服务尚未配置，暂不接受生成任务");
    }
    return this.database.transaction(async (client) => {
      // 同一用户的任务创建串行化，防止多标签页同时绕过额度检查。
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [actor.id]);
      await this.validateReferences(client, actor, input);
      const quota = await this.getQuotaSnapshot(client, actor.id);
      this.assertQuotaAvailable(quota);
      return this.repository.createQueuedJob(client, actor.id, input);
    });
  }

  private async validateReferences(client: PoolClient, actor: Actor, input: CreateGenerationJobInput) {
    if (input.conversationId) {
      const conversation = await client.query("SELECT id FROM conversations WHERE id = $1 AND user_id = $2", [input.conversationId, actor.id]);
      if (!conversation.rowCount) throw new ForbiddenException("无权使用该对话创建生成任务");
    }
    if (input.workflowVersionId) {
      const version = await client.query(`SELECT version.id FROM workflow_versions version JOIN workflows workflow ON workflow.id = version.workflow_id WHERE version.id = $1 AND workflow.status = 'published' AND version.published_at IS NOT NULL`, [input.workflowVersionId]);
      if (!version.rowCount) throw new NotFoundException("可用工作流版本不存在");
    }
    if (input.toolId) {
      const tool = await client.query("SELECT id FROM tools WHERE id = $1 AND status = 'published'", [input.toolId]);
      if (!tool.rowCount) throw new NotFoundException("可用工具不存在");
    }
    if (input.modelConfigId) {
      const model = await client.query("SELECT id FROM model_configs WHERE id = $1 AND status = 'active'", [input.modelConfigId]);
      if (!model.rowCount) throw new NotFoundException("可用模型配置不存在");
    }
  }

  async getJob(actor: Actor, jobId: string) {
    const job = await this.repository.getById(jobId);
    if (!job) throw new NotFoundException("生成任务不存在");
    const canReadAllJobs = actor.roles.some((role) => ["admin", "teacher"].includes(role));
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
