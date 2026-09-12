import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { Actor } from "../auth/auth.service";
import { DatabaseService } from "../database/database.service";
import type { RagQueryInput } from "./rag.contracts";

@Injectable()
export class RagService {
  constructor(private readonly database: DatabaseService) {}

  /** PDF 上传后的索引任务；Worker 与 embedding 适配器在后续校内环境接入。 */
  async enqueueResource(courseId: string, resourceId: string) {
    const result = await this.database.query<{ storage_key: string; mime_type: string }>(
      "SELECT storage_key,mime_type FROM course_resources WHERE id=$1 AND course_id=$2",
      [resourceId, courseId],
    );
    const resource = result.rows[0];
    if (!resource?.storage_key) throw new NotFoundException("课程资料不存在或未存储");
    if (resource.mime_type !== "application/pdf") return { queued: false, reason: "RAG 第一版仅接收 PDF" };

    const documentId = `rag-document-${resourceId}`;
    await this.database.transaction(async (client) => {
      await client.query(`INSERT INTO rag_documents (id,course_id,resource_id,storage_key,mime_type,status,chunk_count,failure_reason,indexed_at)
        VALUES ($1,$2,$3,$4,'application/pdf','queued',0,NULL,NULL)
        ON CONFLICT (resource_id) DO UPDATE SET storage_key=EXCLUDED.storage_key,status='queued',chunk_count=0,failure_reason=NULL,indexed_at=NULL,updated_at=CURRENT_TIMESTAMP`,
      [documentId, courseId, resourceId, resource.storage_key]);
      await client.query("INSERT INTO rag_ingestion_jobs (id,document_id,status) VALUES ($1,$2,'queued') ON CONFLICT DO NOTHING", [`rag-job-${randomUUID()}`, documentId]);
    });
    return { queued: true, documentId };
  }

  async reindex(actor: Actor, courseId: string, resourceId: string) {
    await this.assertCanManage(actor, courseId, resourceId);
    return this.enqueueResource(courseId, resourceId);
  }

  async getResourceStatus(actor: Actor, courseId: string, resourceId: string) {
    await this.assertCanManage(actor, courseId, resourceId);
    const result = await this.database.query(`SELECT document.status,document.chunk_count AS "chunkCount",document.failure_reason AS "failureReason",document.indexed_at AS "indexedAt",
      (SELECT status FROM rag_ingestion_jobs job WHERE job.document_id=document.id ORDER BY job.created_at DESC LIMIT 1) AS "jobStatus"
      FROM rag_documents document WHERE document.course_id=$1 AND document.resource_id=$2`, [courseId, resourceId]);
    return result.rows[0] ?? { status: "not_requested", chunkCount: 0, failureReason: null, indexedAt: null, jobStatus: null };
  }

  /**
   * 已固定对外响应格式。当前没有配置校内 embedding Provider，因此不返回伪造答案；
   * Provider 接入后在此处填充 localEvidence，再按 allowWebFallback 触发联网检索。
   */
  async query(actor: Actor, courseId: string, input: RagQueryInput) {
    await this.assertReadable(actor, courseId);
    return {
      query: input.query,
      scope: input.scope,
      localEvidence: [],
      webEvidence: [],
      webFallbackEligible: input.allowWebFallback,
      retrievalState: "awaiting_embedding_provider",
      message: "课程知识库接口已建立，等待接入校内 embedding 服务后开始索引与检索。",
    };
  }

  private async assertReadable(actor: Actor, courseId: string) {
    const result = await this.database.query<{ status: string; created_by: string | null }>("SELECT status,created_by FROM courses WHERE id=$1", [courseId]);
    const course = result.rows[0];
    if (!course) throw new NotFoundException("课程不存在");
    const manager = actor.roles.includes("admin") || (actor.roles.includes("teacher") && course.created_by === actor.id);
    if (course.status !== "published" && !manager) throw new NotFoundException("课程不存在或尚未发布");
  }

  private async assertCanManage(actor: Actor, courseId: string, resourceId: string) {
    const result = await this.database.query<{ created_by: string | null }>("SELECT course.created_by FROM course_resources resource JOIN courses course ON course.id=resource.course_id WHERE resource.id=$1 AND resource.course_id=$2", [resourceId, courseId]);
    const resource = result.rows[0];
    if (!resource) throw new NotFoundException("课程资料不存在");
    if (!actor.roles.includes("admin") && (!actor.roles.includes("teacher") || resource.created_by !== actor.id)) throw new ForbiddenException("无权管理该课程资料");
  }
}
