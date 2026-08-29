import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { DatabaseService } from "../database/database.service";
import type { CreateGenerationJobInput } from "./generation.contracts";

export interface GenerationJob {
  id: string;
  userId: string;
  jobType: string;
  prompt: string;
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  errorMessage: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

interface GenerationJobRow {
  id: string;
  user_id: string;
  job_type: GenerationJob["jobType"];
  prompt: string;
  status: GenerationJob["status"];
  error_message: string | null;
  created_at: Date;
  started_at: Date | null;
  completed_at: Date | null;
}

@Injectable()
export class GenerationRepository {
  constructor(private readonly database: DatabaseService) {}

  async getById(jobId: string) {
    const result = await this.database.query<GenerationJobRow>(`
      SELECT id, user_id, job_type, prompt, status, error_message, created_at, started_at, completed_at
      FROM generation_jobs
      WHERE id = $1
    `, [jobId]);
    return result.rows[0] ? this.mapJob(result.rows[0]) : undefined;
  }

  async createQueuedJob(client: PoolClient, userId: string, input: CreateGenerationJobInput) {
    const result = await client.query<GenerationJobRow>(`
      INSERT INTO generation_jobs (
        id, user_id, conversation_id, workflow_version_id, tool_id, model_config_id,
        job_type, prompt, parameters_json, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, 'queued')
      RETURNING id, user_id, job_type, prompt, status, error_message, created_at, started_at, completed_at
    `, [
      randomUUID(), userId, input.conversationId ?? null, input.workflowVersionId ?? null,
      input.toolId ?? null, input.modelConfigId ?? null, input.jobType, input.prompt,
      JSON.stringify(input.parameters),
    ]);
    return this.mapJob(result.rows[0]);
  }

  private mapJob(row: GenerationJobRow): GenerationJob {
    return {
      id: row.id,
      userId: row.user_id,
      jobType: row.job_type,
      prompt: row.prompt,
      status: row.status,
      errorMessage: row.error_message,
      createdAt: row.created_at.toISOString(),
      startedAt: row.started_at?.toISOString() ?? null,
      completedAt: row.completed_at?.toISOString() ?? null,
    };
  }
}
