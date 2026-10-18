import { Injectable, Logger } from "@nestjs/common";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { access, mkdtemp, readdir, rm, unlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { getEnvironment } from "../../common/environment";
import { DatabaseService } from "../database/database.service";
import { createEmbeddings, vectorLiteral } from "./rag.embedding";

const execFileAsync = promisify(execFile);
const EMBEDDING_BATCH_SIZE = 16;
const MAX_ATTEMPTS = 3;
const PROCESSING_LEASE_MINUTES = 15;
// 一页里少于 30 个非空白字符就当作「没有文字层」，多半是扫描件。
const OCR_MIN_CHARS_PER_PAGE = 30;
const OCR_LANGUAGES = "chi_sim+eng";
const OCR_PAGE_TIMEOUT_MS = 120_000;
const OCR_LEASE_RENEW_PAGES = 10;

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
    const textLayer = await execFileAsync("pdftotext", ["-layout", filePath, "-"], { maxBuffer: 64 * 1024 * 1024, timeout: 180_000 })
      .then((result) => result.stdout)
      .catch(() => "");
    let chunks = chunkPdfText(textLayer);
    let usedOcr = false;
    // 只有文字层确实空（扫描件）才走 OCR：正常 PDF 不额外花这十几分钟。
    if (environment.ragOcrEnabled && needsOcr(textLayer)) {
      const pageCount = await countPdfPages(filePath);
      const limit = environment.ragOcrMaxPages > 0 ? Math.min(pageCount, environment.ragOcrMaxPages) : pageCount;
      this.logger.log(`RAG 索引 ${job.document_id}：文字层为空，改用 OCR（共 ${pageCount} 页，本次处理前 ${limit} 页，${environment.ragOcrDpi}dpi）`);
      const ocrChunks = await this.ocrChunks(job, filePath, pageCount, limit, environment.ragOcrDpi);
      if (ocrChunks.length) { chunks = ocrChunks; usedOcr = true; }
    }
    if (!chunks.length) {
      throw new Error(environment.ragOcrEnabled
        ? "PDF 未提取到可索引文本（已尝试 OCR）；请上传文字版 PDF，或换成更清晰的扫描件"
        : "PDF 未提取到可索引文本；请上传包含可选择文字的 PDF");
    }
    const sectionLabel = (pageNumber: number) => usedOcr ? `第 ${pageNumber} 页 · OCR` : `第 ${pageNumber} 页`;
    const vectors: number[][] = [];
    for (let offset = 0; offset < chunks.length; offset += EMBEDDING_BATCH_SIZE) vectors.push(...await createEmbeddings(chunks.slice(offset, offset + EMBEDDING_BATCH_SIZE).map((chunk) => chunk.content)));
    await this.database.transaction(async (client) => {
      await client.query("DELETE FROM rag_chunks WHERE document_id=$1", [job.document_id]);
      for (const [index, chunk] of chunks.entries()) await client.query(`INSERT INTO rag_chunks (id,document_id,course_id,resource_id,page_number,chunk_index,section_label,content,embedding)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::vector)`, [`rag-chunk-${job.document_id}-${index}`, job.document_id, job.course_id, job.resource_id, chunk.pageNumber, index, sectionLabel(chunk.pageNumber), chunk.content, vectorLiteral(vectors[index])]);
      await client.query("UPDATE rag_documents SET status='indexed',chunk_count=$2,failure_reason=NULL,indexed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=$1", [job.document_id, chunks.length]);
      await client.query("UPDATE rag_ingestion_jobs SET status='succeeded',completed_at=CURRENT_TIMESTAMP,error_message=NULL WHERE id=$1", [job.id]);
    });
    this.logger.log(`RAG 已索引 ${job.document_id}：${chunks.length} 个分块${usedOcr ? "（OCR）" : ""}`);
  }

  /**
   * 逐页 OCR：pdftoppm 渲染单页 PNG → tesseract 识别 → 立刻删掉 PNG。
   * 一本书十几分钟，所以每 10 页续一次任务租约，避免被当成死任务重新领取。
   */
  private async ocrChunks(job: IngestionJob, filePath: string, pageCount: number, limit: number, dpi: number) {
    const directory = await mkdtemp(path.join(os.tmpdir(), "artedu-ocr-"));
    const chunks: Array<{ pageNumber: number; content: string }> = [];
    try {
      for (let page = 1; page <= limit; page++) {
        const prefix = path.join(directory, `page-${page}`);
        await execFileAsync("pdftoppm", ["-r", String(dpi), "-gray", "-png", "-f", String(page), "-l", String(page), filePath, prefix], { timeout: 90_000 });
        const image = (await readdir(directory)).find((name) => name.startsWith(`page-${page}`) && name.endsWith(".png"));
        if (!image) continue;
        const { stdout } = await execFileAsync("tesseract", [path.join(directory, image), "stdout", "-l", OCR_LANGUAGES], { maxBuffer: 8 * 1024 * 1024, timeout: OCR_PAGE_TIMEOUT_MS });
        await unlink(path.join(directory, image)).catch(() => {});
        chunks.push(...chunkPageText(stdout, page));
        if (page % OCR_LEASE_RENEW_PAGES === 0 || page === limit) await this.renewLease(job, page, pageCount);
      }
    } finally {
      // 中间 PNG 必须清掉：一本 208 页的书按 200dpi 会写出几百 MB。
      await rm(directory, { recursive: true, force: true }).catch(() => {});
    }
    return chunks;
  }

  private async renewLease(job: IngestionJob, done: number, total: number) {
    await this.database.query("UPDATE rag_ingestion_jobs SET started_at=CURRENT_TIMESTAMP WHERE id=$1 AND status='processing'", [job.id]).catch(() => undefined);
    this.logger.log(`RAG OCR ${job.document_id}: ${done}/${total} 页`);
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

/**
 * 文字层是不是「几乎没有字」。扫描件的 PDF 里通常只剩页码或一两个装饰字，
 * 用平均每页非空白字符数判断，比「完全为 0」更能挡住只有页眉的伪文字层。
 */
export function needsOcr(text: string): boolean {
  const pages = text.split("\f");
  const visible = text.replace(/\s/g, "").length;
  return visible / Math.max(pages.length, 1) < OCR_MIN_CHARS_PER_PAGE;
}

function chunkTextPage(page: string, pageNumber: number) {
  const chunks: Array<{ pageNumber: number; content: string }> = [];
  const normalized = page.replace(/\s+/g, " ").trim();
  for (let start = 0; start < normalized.length; start += 700) {
    const content = normalized.slice(start, start + 900).trim();
    if (content.length >= 20) chunks.push({ pageNumber, content });
    if (start + 900 >= normalized.length) break;
  }
  return chunks;
}

function chunkPdfText(text: string) {
  return text.split("\f").flatMap((page, index) => chunkTextPage(page, index + 1));
}

/** OCR 拿到的是单页文本，走同一套窗口切块，页码由调用方给出。 */
export function chunkPageText(text: string, pageNumber: number) {
  return chunkTextPage(text, pageNumber);
}

/** 页数优先问 pdfinfo；缺这个命令时退回按换页符计数。 */
async function countPdfPages(filePath: string) {
  const info = await execFileAsync("pdfinfo", [filePath], { timeout: 30_000, maxBuffer: 1024 * 1024 })
    .then((result) => result.stdout)
    .catch(() => "");
  const pages = Number(/^Pages:\s+(\d+)/m.exec(info)?.[1]);
  if (Number.isFinite(pages) && pages > 0) return pages;
  const text = await execFileAsync("pdftotext", ["-layout", filePath, "-"], { maxBuffer: 64 * 1024 * 1024, timeout: 180_000 })
    .then((result) => result.stdout)
    .catch(() => "");
  return Math.max(text.split("\f").length, 1);
}

function sleep(milliseconds: number) { return new Promise<void>((resolve) => setTimeout(resolve, milliseconds)); }
