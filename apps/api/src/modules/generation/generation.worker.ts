import { Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { DatabaseService } from "../database/database.service";
import { getEnvironment } from "../../common/environment";
import { ModelRegistry } from "./model-registry";

interface ClaimedJob {
  id: string;
  user_id: string;
  model_config_id: string | null;
  job_type: string;
  prompt: string;
  parameters_json: Record<string, unknown>;
}

/**
 * 任务 worker 与 HTTP API 使用不同进程启动（npm run worker）。
 * 当前只实现可靠的领取/状态流转；真实模型供应商和学校对象存储接入后，
 * 在 executeJob 中写入 generation_outputs 与 usage_records 即可。
 */
@Injectable()
export class GenerationWorkerService {
  private readonly logger = new Logger(GenerationWorkerService.name);

  constructor(
    private readonly database: DatabaseService,
    private readonly modelRegistry: ModelRegistry,
  ) {}

  async processOnce() {
    if (!getEnvironment().modelExecutionEnabled) {
      this.logger.warn("模型执行服务未配置，worker 跳过领取任务");
      return false;
    }
    const job = await this.database.transaction((client) => this.claimNextJob(client));
    if (!job) return false;

    try {
      await this.executeJob(job);
      await this.database.query(`
        UPDATE generation_jobs
        SET status = 'succeeded', completed_at = CURRENT_TIMESTAMP
        WHERE id = $1
      `, [job.id]);
      await this.database.query(`
        INSERT INTO usage_records (id, user_id, model_config_id, capability, request_id, status)
        VALUES ($1, $2, $3, 'image_generation', $4, 'success')
      `, [randomUUID(), job.user_id, job.model_config_id, `job:${job.id}`]);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 1000) : "未知任务错误";
      await this.database.query(`
        UPDATE generation_jobs
        SET status = 'failed', error_message = $2, completed_at = CURRENT_TIMESTAMP
        WHERE id = $1
      `, [job.id, message]);
      this.logger.error(`Generation job ${job.id} failed: ${message}`);
      return true;
    }
  }

  async runForever(intervalMs = 1000) {
    this.logger.log("Generation worker is ready");
    for (;;) {
      const processed = await this.processOnce();
      if (!processed) await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }

  private async claimNextJob(client: PoolClient): Promise<ClaimedJob | undefined> {
    const result = await client.query<ClaimedJob>(`
      WITH next_job AS (
        SELECT id
        FROM generation_jobs
        WHERE status = 'queued'
        ORDER BY created_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      UPDATE generation_jobs job
      SET status = 'running', started_at = CURRENT_TIMESTAMP
      FROM next_job
      WHERE job.id = next_job.id
      RETURNING job.id, job.user_id, job.model_config_id, job.job_type, job.prompt, job.parameters_json
    `);
    return result.rows[0];
  }

  private async executeJob(job: ClaimedJob) {
    const adapter = this.modelRegistry.getForJob({ jobType: job.job_type as any, modelConfigId: job.model_config_id ?? undefined });
    return adapter.execute({
      jobType: job.job_type as any,
      prompt: job.prompt,
      parameters: job.parameters_json ?? {},
      modelConfigId: job.model_config_id,
    });
  }
}
