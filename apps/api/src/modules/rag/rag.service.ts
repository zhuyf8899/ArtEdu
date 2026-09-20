import { ForbiddenException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { getEnvironment } from "../../common/environment";
import type { Actor } from "../auth/auth.service";
import { DatabaseService } from "../database/database.service";
import type { RagQueryInput } from "./rag.contracts";
import { createEmbeddings, vectorLiteral } from "./rag.embedding";

interface LocalEvidenceRow {
  id: string;
  title: string;
  resource_type: string;
  transcript_text: string;
  match_position: number;
}

interface VectorEvidenceRow { resource_id: string; title: string; resource_type: string; content: string; page_number: number; similarity: number; }

@Injectable()
export class RagService {
  private readonly logger = new Logger(RagService.name);
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
   * 在校内 embedding Provider 接入前，优先使用教师已经录入的课程转写文本做本地证据检索。
   * 这不是向量检索：没有文本命中时会如实返回等待 embedding Provider，而不会编造答案。
   */
  async query(actor: Actor, courseId: string, input: RagQueryInput) {
    await this.assertReadable(actor, courseId);
    try {
      const [queryVector] = await createEmbeddings([input.query]);
      const vectorResult = await this.database.query<VectorEvidenceRow>(`SELECT chunk.resource_id,resource.title,resource.resource_type,chunk.content,chunk.page_number,
        1 - (chunk.embedding <=> $2::vector) AS similarity
        FROM rag_chunks chunk JOIN course_resources resource ON resource.id=chunk.resource_id
        JOIN rag_documents document ON document.id=chunk.document_id
        WHERE chunk.course_id=$1 AND resource.status='published' AND document.status='indexed'
          AND 1 - (chunk.embedding <=> $2::vector) >= $3
        ORDER BY chunk.embedding <=> $2::vector LIMIT 5`, [courseId, vectorLiteral(queryVector), getEnvironment().ragMinSimilarity]);
      if (vectorResult.rows.length) return {
        query: input.query, scope: input.scope,
        localEvidence: vectorResult.rows.map((row) => ({ resourceId: row.resource_id, resourceTitle: row.title, resourceType: row.resource_type, excerpt: row.content, pageNumber: row.page_number, similarity: Number(row.similarity.toFixed(3)) })),
        webEvidence: [], webFallbackEligible: input.allowWebFallback, retrievalState: "vector_evidence",
        message: "已从本课程已索引的 PDF 中找到语义相关证据。",
      };
    } catch (error) {
      // 向量服务短暂不可用时继续走已有的精确文本证据，不把系统错误伪装成答案。
      if (getEnvironment().ragEnabled) this.logger.warn(error instanceof Error ? error.message : "向量检索失败");
    }
    const result = await this.database.query<LocalEvidenceRow>(`
      SELECT id,title,resource_type,transcript_text,
        GREATEST(strpos(lower(transcript_text), lower($2)), 1) AS match_position
      FROM course_resources
      WHERE course_id=$1 AND status='published' AND transcript_text IS NOT NULL
        AND char_length(btrim(transcript_text)) > 0
        AND lower(transcript_text) LIKE '%' || lower($2) || '%'
      ORDER BY match_position, sort_order, created_at
      LIMIT 5
    `, [courseId, input.query]);
    const localEvidence = result.rows.map((row) => ({
      resourceId: row.id,
      resourceTitle: row.title,
      resourceType: row.resource_type,
      excerpt: excerptAroundMatch(row.transcript_text, Number(row.match_position), input.query.length),
      match: input.query,
    }));
    if (localEvidence.length) {
      return {
        query: input.query,
        scope: input.scope,
        localEvidence,
        webEvidence: [],
        webFallbackEligible: input.allowWebFallback,
        retrievalState: "local_text_evidence",
        message: "已从本课程已授权的转写文本中找到相关证据；向量检索接入后可提供更宽泛的语义匹配。",
      };
    }
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
    if (manager) return;
    const enrollment = await this.database.query("SELECT 1 FROM course_enrollments WHERE course_id=$1 AND user_id=$2 AND status <> 'withdrawn'", [courseId, actor.id]);
    if (!enrollment.rowCount) throw new ForbiddenException("请先加入课程后再使用课程知识库");
  }

  private async assertCanManage(actor: Actor, courseId: string, resourceId: string) {
    const result = await this.database.query<{ created_by: string | null }>("SELECT course.created_by FROM course_resources resource JOIN courses course ON course.id=resource.course_id WHERE resource.id=$1 AND resource.course_id=$2", [resourceId, courseId]);
    const resource = result.rows[0];
    if (!resource) throw new NotFoundException("课程资料不存在");
    if (!actor.roles.includes("admin") && (!actor.roles.includes("teacher") || resource.created_by !== actor.id)) throw new ForbiddenException("无权管理该课程资料");
  }
}

function excerptAroundMatch(text: string, position: number, queryLength: number) {
  const start = Math.max(0, position - 1 - 90);
  const end = Math.min(text.length, position - 1 + queryLength + 150);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < text.length ? "…" : "";
  return `${prefix}${text.slice(start, end).replace(/\s+/g, " ").trim()}${suffix}`;
}
