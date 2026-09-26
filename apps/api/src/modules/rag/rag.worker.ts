import { Injectable, Logger } from "@nestjs/common";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { access } from "node:fs/promises";
import path from "node:path";
import { getEnvironment } from "../../common/environment";
import { DatabaseService } from "../database/database.service";
import { createEmbeddings, vectorLiteral } from "./rag.embedding";

const execFileAsync = promisify(execFile);
const EMBEDDING_BATCH_SIZE = 16;
const MAX_ATTEMPTS = 3;
const PROCESSING_LEASE_MINUTES = 15;

interface IngestionJob {
  id: string;
  document_id: string;
  course_id: string;
  resource_id: string;
  storage_key: string;
}

@Injectable()
export class RagWorkerService {
  private readonly logger = new Logger(RagWorkerService.name);
  constructor(private readonly database: DatabaseService) {}

  async runForever(): Promise<void> {
    const environment = getEnvironment();
    if (!environment.ragEnabled) {
      this.logger.log("RAG Worker 已启动，RAG_ENABLED=false，不领取索引任务");
      while (true) await sleep(60_000);
    }
    this.logger.log("RAG Worker 已启动，使用校内 embedding 服务处理课程 PDF");
    while (true) {
      const job = await this.claimJob();
      if (!job) { await sleep(1_500); continue; }
      try { await this.ingest(job); }
      catch (error) { await this.fail(job, error); }
    }
  }

  private async claimJob(): Promise<IngestionJob | null> {
    return this.database.transaction(async (client) => {
      // Worker 被 OOM/重启时，processing 任务不能永久堵塞队列；回收过期租约后再领取。
      await client.query(`UPDATE rag_ingestion_jobs
        SET status='queued', started_at=NULL, error_message='索引 Worker 任务租约已过期'
        WHERE status='processing' AND started_at < CURRENT_TIMESTAMP - make_interval(mins => $1)`, [PROCESSING_LEASE_MINUTES]);
      const result = await client.query<IngestionJob>(`SELECT job.id,job.document_id,document.course_id,document.resource_id,document.storage_key
        FROM rag_ingestion_jobs job JOIN rag_documents document ON document.id=job.document_id
        WHERE job.status='queued' AND job.attempts < $1 ORDER BY job.created_at LIMIT 1 FOR UPDATE SKIP LOCKED`, [MAX_ATTEMPTS]);
      const job = result.rows[0];
      if (!job) return null;
      await client.query("UPDATE rag_ingestion_jobs SET status='processing',attempts=attempts+1,started_at=CURRENT_TIMESTAMP,error_message=NULL WHERE id=$1", [job.id]);
      await client.query("UPDATE rag_documents SET status='processing',failure_reason=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=$1", [job.document_id]);
      return job;
    });
  }

  private async ingest(job: IngestionJob) {
    const environment = getEnvironment();
    const filePath = safeUploadPath(environment.uploadRoot, job.storage_key);
    await access(filePath).catch(() => { throw new Error("课程 PDF 文件不存在或无法读取"); });
    const { stdout } = await execFileAsync("pdftotext", ["-layout", filePath, "-"], { maxBuffer: 20 * 1024 * 1024, timeout: 60_000 });
    const chunks = chunkPdfText(stdout);
    if (!chunks.length) throw new Error("PDF 未提取到可索引文本；请上传包含可选择文字的 PDF");
    const vectors: number[][] = [];
    for (let offset = 0; offset < chunks.length; offset += EMBEDDING_BATCH_SIZE) vectors.push(...await createEmbeddings(chunks.slice(offset, offset + EMBEDDING_BATCH_SIZE).map((chunk) => chunk.content)));
    await this.database.transaction(async (client) => {
      await client.query("DELETE FROM rag_chunks WHERE document_id=$1", [job.document_id]);
      for (const [index, chunk] of chunks.entries()) await client.query(`INSERT INTO rag_chunks (id,document_id,course_id,resource_id,page_number,chunk_index,section_label,content,embedding)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::vector)`, [`rag-chunk-${job.document_id}-${index}`, job.document_id, job.course_id, job.resource_id, chunk.pageNumber, index, `第 ${chunk.pageNumber} 页`, chunk.content, vectorLiteral(vectors[index])]);
      await client.query("UPDATE rag_documents SET status='indexed',chunk_count=$2,failure_reason=NULL,indexed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=$1", [job.document_id, chunks.length]);
      await client.query("UPDATE rag_ingestion_jobs SET status='succeeded',completed_at=CURRENT_TIMESTAMP,error_message=NULL WHERE id=$1", [job.id]);
    });
    this.logger.log(`RAG 已索引 ${job.document_id}：${chunks.length} 个分块`);
  }

  private async fail(job: IngestionJob, error: unknown) {
    const reason = (error instanceof Error ? error.message : "未知索引错误").slice(0, 1000);
    this.logger.error(`RAG 索引失败 ${job.document_id}: ${reason}`);
    await this.database.transaction(async (client) => {
      const result = await client.query<{ attempts: number }>("SELECT attempts FROM rag_ingestion_jobs WHERE id=$1 FOR UPDATE", [job.id]);
      const attempts = Number(result.rows[0]?.attempts ?? MAX_ATTEMPTS);
      const terminal = attempts >= MAX_ATTEMPTS;
      await client.query(terminal
        ? "UPDATE rag_ingestion_jobs SET status='failed',completed_at=CURRENT_TIMESTAMP,error_message=$2 WHERE id=$1"
        : "UPDATE rag_ingestion_jobs SET status='queued',started_at=NULL,error_message=$2 WHERE id=$1", [job.id, reason]);
      await client.query("UPDATE rag_documents SET status=$2,failure_reason=$3,updated_at=CURRENT_TIMESTAMP WHERE id=$1", [job.document_id, terminal ? "failed" : "queued", reason]);
    });
  }
}

function safeUploadPath(root: string, storageKey: string) {
  if (!storageKey || storageKey.startsWith("/") || storageKey.includes("\\") || storageKey.split("/").some((part) => !part || part === "." || part === "..")) throw new Error("课程文件路径无效");
  const target = path.resolve(root, ...storageKey.split("/"));
  if (!target.startsWith(`${path.resolve(root)}${path.sep}`)) throw new Error("课程文件路径越界");
  return target;
}

function chunkPdfText(text: string) {
  const chunks: Array<{ pageNumber: number; content: string }> = [];
  for (const [pageIndex, page] of text.split("\f").entries()) {
    const normalized = page.replace(/\s+/g, " ").trim();
    for (let start = 0; start < normalized.length; start += 700) {
      const content = normalized.slice(start, start + 900).trim();
      if (content.length >= 20) chunks.push({ pageNumber: pageIndex + 1, content });
      if (start + 900 >= normalized.length) break;
    }
  }
  return chunks;
}

function sleep(milliseconds: number) { return new Promise<void>((resolve) => setTimeout(resolve, milliseconds)); }
