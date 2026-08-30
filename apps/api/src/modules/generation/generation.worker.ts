import { Inject, Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { DatabaseService } from "../database/database.service";

interface ClaimedJob {
  id: string;
  user_id: string;
  model_config_id: string | null;
  job_type: string;
  prompt: string;
}

/**
 * 任务 worker 与 HTTP API 使用不同进程启动（npm run worker）。
 * 当前只实现可靠的领取/状态流转；真实模型供应商和学校对象存储接入后，
 * 在 executeJob 中写入 generation_outputs 与 usage_records 即可。
 */
@Injectable()
export class GenerationWorkerService {
  private readonly logger = new Logger(GenerationWorkerService.name);

  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async processOnce() {
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
      RETURNING job.id, job.user_id, job.model_config_id, job.job_type, job.prompt
    `);
    return result.rows[0];
  }

  private async executeJob(job: ClaimedJob) {
    // TODO: 依据 model_config_id 解析模型配置和 secret_ref，调用 ModelProviderAdapter。
    // TODO: 将文件上传学校 S3 兼容对象存储，并插入 generation_outputs。
    throw new Error(`模型执行适配器尚未配置（任务类型：${job.job_type}）`);
  }
}
