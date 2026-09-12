import { ConflictException, ForbiddenException, HttpException, HttpStatus, Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import type { PoolClient } from "pg";
import { MANAGED_QUOTA_CAPABILITY } from "../../common/constants";
import { getEnvironment } from "../../common/environment";
import type { Actor } from "../auth/auth.service";
import { DatabaseService } from "../database/database.service";
import type { CreateGenerationJobInput, RunGenerationJobInput } from "./generation.contracts";
import { GenerationRepository } from "./generation.repository";
import type { ModelResult } from "./model-adapter";
import { ModelRegistry } from "./model-registry";
import { OfficeExportService, type OfficeFormat } from "./office-export.service";
import { DocumentContentError, documentMarkdown, documentPrompt, officeFormatSchema, parseDocumentContent, type DocumentContent } from "./document-content";
import { assertPdfAvailable, PdfExportError } from "./pdf-export";

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
    private readonly models: ModelRegistry,
    private readonly officeExports: OfficeExportService = new OfficeExportService(),
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

  async downloadOutput(actor: Actor, jobId: string) {
    const job = await this.getJob(actor, jobId);
    const output = await this.repository.getLatestOutput(job.id);
    if (!output) throw new NotFoundException("该任务尚未生成可下载文件");
    return { output, data: await this.officeExports.read(output.storageKey) };
  }

  async runJob(actor: Actor, input: RunGenerationJobInput) {
    let adapter;
    try {
      adapter = this.models.getForJob({ jobType: input.jobType, modelConfigId: input.modelConfigId });
    } catch {
      throw new ServiceUnavailableException("所选模型当前未配置或不支持此创作方式");
    }

    const modelConfigId = input.modelConfigId ?? adapter.id;
    input = { ...input, modelConfigId };
    const format = input.jobType === "document" ? officeFormatSchema.parse(input.parameters.outputFormat ?? "docx") : "docx";
    // Reject missing PDF dependencies before incurring model usage.
    if (format === "pdf") {
      try { assertPdfAvailable(); } catch (error) { throw new ServiceUnavailableException(providerFailureMessage(error)); }
    }
    const job = await this.createJob(actor, input);
    if (!await this.repository.markRunning(job.id)) throw new ConflictException("生成任务已被执行或当前不可执行");
    const pageCount = input.jobType === "document" && format === "pptx" ? input.parameters.pageCount as number | undefined : undefined;
    const systemPrompt = input.jobType === "document" ? documentPrompt(format, pageCount) : buildCreationSystemPrompt(input.jobType);
    let inputUnits = 0;
    let outputUnits = 0;
    try {
      const output = await adapter.execute({
        jobType: input.jobType,
        modelConfigId: input.modelConfigId,
        // 产物类适配器（图像/视频）需要 jobId 决定文件落盘目录。
        jobId: job.id,
        messages: [
          { role: "system", content: systemPrompt },
          ...(input.context ?? []),
          { role: "user", content: input.prompt },
        ],
        parameters: {
          temperature: 0.4,
          maxTokens: input.jobType === "document" ? 6500 : 1200,
          ...(input.jobType === "document" ? { responseFormat: "json_object" as const } : {}),
          providerOptions: { thinking: { type: "disabled" } },
        },
      });
      inputUnits = Number(output.metadata?.inputTokens ?? 0);
      outputUnits = Number(output.metadata?.outputTokens ?? 0);
      if (input.jobType === "document" && output.finishReason === "length") throw new DocumentContentError("文档正文被模型截断，未生成不完整文件，请减少页数或内容后重试");
      const document = input.jobType === "document" ? parseDocumentContent(output.content, pageCount) : undefined;
      const artifact = document ? await this.createOfficeArtifact(job.id, document, format) : await this.createArtifact(job.id, output);
      const completed = await this.repository.completeJob(job.id);
      await this.repository.recordUsage({
        userId: actor.id,
        modelConfigId,
        requestId: job.id,
        inputUnits,
        outputUnits,
        status: "success",
      });
      return {
        job: completed ?? { ...job, status: "succeeded" }, output: document ? { ...output, content: documentMarkdown(document) } : output,
        artifact: artifact && { fileName: artifact.fileName, mimeType: artifact.mimeType, fileSize: artifact.fileSize, downloadUrl: `/api/generation-jobs/${job.id}/download` },
      };
    } catch (error) {
      const reason = providerFailureMessage(error);
      await this.repository.failJob(job.id, reason);
      await this.repository.recordUsage({
        userId: actor.id,
        modelConfigId,
        requestId: job.id,
        inputUnits,
        outputUnits,
        status: "failed",
        errorCode: providerErrorCode(error),
      });
      throw new ServiceUnavailableException(reason);
    }
  }

  private async createOfficeArtifact(jobId: string, content: DocumentContent, format: OfficeFormat) {
    const artifact = await this.officeExports.create(jobId, content, format);
    try { await this.repository.createOutput(jobId, artifact); }
    catch (error) { await this.officeExports.remove(artifact.storageKey).catch(() => undefined); throw error; }
    return artifact;
  }

  /**
   * 产物类适配器（图像/视频）已经按 uploadRoot/generated/<jobId>/ 的约定把文件写好，
   * 这里只登记元数据；文本类任务仍按需导出 Office 文件，其余任务没有可下载产物。
   */
  private async createArtifact(jobId: string, output: ModelResult) {
    if (output.kind === "asset") {
      const artifact = {
        storageKey: output.content,
        fileName: String(output.metadata?.fileName ?? "artedu-asset"),
        mimeType: output.mimeType ?? "application/octet-stream",
        fileSize: Number(output.metadata?.fileSize ?? 0),
      };
      await this.repository.createOutput(jobId, artifact);
      return artifact;
    }
    return undefined;
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

function buildCreationSystemPrompt(jobType: RunGenerationJobInput["jobType"]) {
  const instruction = {
    image: "围绕 UI 与视觉创作，给出目标、信息层级、构图、色彩、组件和可执行步骤。",
    pattern: "围绕图案创作，给出主题、构图单元、连续方式、色彩、材质、提示词和迭代建议。",
    webpage: "围绕 Vibe Coding，给出页面结构、组件、交互状态、响应式策略、实现步骤和验收标准。",
    video: "围绕视频创作，给出叙事结构、镜头、节奏、视听风格和制作步骤。",
    document: "围绕艺术文档创作，给出结构、内容层次、视觉规范和校对步骤。",
    knowledge_graph: "围绕艺术知识梳理，给出实体、关系、层级和可验证的信息组织方案。",
  }[jobType];
  return `你是 ArtEdu 艺术教育平台的中文创作助教。${instruction} 输出应简洁、具体、可执行，使用清晰的小标题；信息不足时明确假设。你当前只输出创作方案，不得声称已经生成图片、文件、代码仓库或部署链接。`;
}

function providerErrorCode(error: unknown) {
  if (error instanceof PdfExportError) return "pdf_export_error";
  if (error instanceof DocumentContentError) return "document_content_error";
  if (error instanceof Error && error.name === "AbortError") return "timeout";
  const status = error instanceof Error ? error.message.match(/HTTP (\d{3})/)?.[1] : undefined;
  return status ? `provider_${status}` : "provider_error";
}

function providerFailureMessage(error: unknown) {
  if (error instanceof DocumentContentError || error instanceof PdfExportError) return error.message;
  if (error instanceof Error && error.name === "AbortError") return "模型响应超时，请稍后重试";
  const status = error instanceof Error ? error.message.match(/HTTP (\d{3})/)?.[1] : undefined;
  return ({
    "401": "模型服务认证失败，请联系管理员更新 API Key",
    "402": "模型账户余额不足，请充值后重试",
    "429": "模型服务请求较多，请稍后重试",
    "500": "模型服务暂时异常，请稍后重试",
    "503": "模型服务当前繁忙，请稍后重试",
  } as Record<string, string>)[status ?? ""] ?? "模型调用失败，请稍后重试";
}
