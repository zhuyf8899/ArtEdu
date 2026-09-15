import { BadRequestException, ForbiddenException, Injectable, NotFoundException, OnModuleDestroy, OnModuleInit, PayloadTooLargeException } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { createReadStream } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import AdmZip from "adm-zip";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { getEnvironment } from "../../common/environment";
import type { Actor } from "../auth/auth.service";
import { DatabaseService } from "../database/database.service";
import { storePrivateUpload } from "../studio/private-upload";

interface UploadRow { id: string; user_id: string; file_name: string; mime_type: string; storage_key: string; size_bytes: number; expires_at: Date; }
const execFile = promisify(execFileCallback);
const MAX_AGENT_FILE_TEXT = 12000;

@Injectable()
export class CreationStorageService implements OnModuleInit, OnModuleDestroy {
  private cleanupTimer?: NodeJS.Timeout;
  constructor(private readonly database: DatabaseService) {}

  onModuleInit() {
    this.cleanupTimer = setInterval(() => { void this.cleanupExpired(); }, 60 * 60 * 1000);
    this.cleanupTimer.unref();
    void this.cleanupExpired();
  }

  onModuleDestroy() { if (this.cleanupTimer) clearInterval(this.cleanupTimer); }

  async upload(actor: Actor, request: FastifyRequest, conversationLocalId?: string) {
    const environment = getEnvironment();
    if (!environment.fileUploadsEnabled) throw new ForbiddenException("文件上传未启用");
    const part = await request.file();
    if (!part) throw new BadRequestException("请选择一个文件");
    const upload = await storePrivateUpload(part, environment.uploadRoot, undefined, `temporary/${actor.id}`);
    try {
      const row = await this.database.transaction(async (client) => {
        await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`temporary-upload:${actor.id}`]);
        const used = await client.query<{ bytes: string }>("SELECT COALESCE(SUM(size_bytes), 0)::text AS bytes FROM temporary_creation_uploads WHERE user_id=$1 AND deleted_at IS NULL AND expires_at > CURRENT_TIMESTAMP", [actor.id]);
        if (Number(used.rows[0]?.bytes ?? 0) + upload.sizeBytes > environment.temporaryUploadQuotaBytes) throw new PayloadTooLargeException(`临时创作文件已达到 ${Math.floor(environment.temporaryUploadQuotaBytes / 1024 / 1024)} MB 配额，请删除文件或等待过期清理`);
        const id = `temp-upload-${randomUUID()}`;
        const result = await client.query<UploadRow>("INSERT INTO temporary_creation_uploads (id,user_id,conversation_local_id,file_name,mime_type,storage_key,size_bytes,sha256,expires_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,CURRENT_TIMESTAMP + ($9 * INTERVAL '1 hour')) RETURNING id,user_id,file_name,mime_type,storage_key,size_bytes,expires_at", [id, actor.id, conversationLocalId ?? null, upload.fileName, upload.mimeType, upload.storageKey, upload.sizeBytes, upload.sha256, environment.temporaryUploadRetentionHours]);
        return result.rows[0];
      });
      return this.present(row);
    } catch (error) {
      await rm(path.join(environment.uploadRoot, upload.storageKey), { force: true });
      throw error;
    }
  }

  async list(actor: Actor) {
    const result = await this.database.query<UploadRow>("SELECT id,user_id,file_name,mime_type,storage_key,size_bytes,expires_at FROM temporary_creation_uploads WHERE user_id=$1 AND deleted_at IS NULL AND expires_at > CURRENT_TIMESTAMP ORDER BY created_at DESC", [actor.id]);
    const usedBytes = result.rows.reduce((sum, row) => sum + Number(row.size_bytes), 0);
    return { quotaBytes: getEnvironment().temporaryUploadQuotaBytes, usedBytes, items: result.rows.map((row) => this.present(row)) };
  }

  async open(actor: Actor, uploadId: string) {
    const result = await this.database.query<UploadRow>("SELECT id,user_id,file_name,mime_type,storage_key,size_bytes,expires_at FROM temporary_creation_uploads WHERE id=$1 AND deleted_at IS NULL AND expires_at > CURRENT_TIMESTAMP", [uploadId]);
    const row = result.rows[0];
    if (!row || row.user_id !== actor.id) throw new ForbiddenException("无权访问该临时文件");
    await this.database.query("UPDATE temporary_creation_uploads SET last_accessed_at=CURRENT_TIMESTAMP, expires_at=CURRENT_TIMESTAMP + ($2 * INTERVAL '1 hour') WHERE id=$1", [uploadId, getEnvironment().temporaryUploadRetentionHours]);
    return { ...this.present(row), stream: createReadStream(path.join(getEnvironment().uploadRoot, row.storage_key)) };
  }

  /**
   * 将用户本轮已经授权上传的文件转换成受长度限制的文本上下文。
   * 这里绝不把服务器绝对路径交给模型；模型只看到文件名和内容摘要。
   */
  async readForAgent(actor: Actor, uploadId: string) {
    const result = await this.database.query<UploadRow>("SELECT id,user_id,file_name,mime_type,storage_key,size_bytes,expires_at FROM temporary_creation_uploads WHERE id=$1 AND deleted_at IS NULL AND expires_at > CURRENT_TIMESTAMP", [uploadId]);
    const row = result.rows[0];
    if (!row || row.user_id !== actor.id) throw new ForbiddenException("无权读取该临时文件");
    const filePath = path.join(getEnvironment().uploadRoot, row.storage_key);
    const content = await extractAgentText(filePath, row.mime_type).catch(() => "");
    await this.database.query("UPDATE temporary_creation_uploads SET last_accessed_at=CURRENT_TIMESTAMP, expires_at=CURRENT_TIMESTAMP + ($2 * INTERVAL '1 hour') WHERE id=$1", [uploadId, getEnvironment().temporaryUploadRetentionHours]);
    return {
      ...this.present(row),
      content: content.slice(0, MAX_AGENT_FILE_TEXT),
      readable: Boolean(content),
      note: content ? "文件内容已读取并加入本轮上下文。" : "文件已关联到本轮对话；该格式目前不提取文字内容。",
    };
  }

  async cleanupExpired() {
    const expired = await this.database.query<UploadRow>("SELECT id,user_id,file_name,mime_type,storage_key,size_bytes,expires_at FROM temporary_creation_uploads WHERE deleted_at IS NULL AND expires_at <= CURRENT_TIMESTAMP LIMIT 200");
    for (const row of expired.rows) {
      await rm(path.join(getEnvironment().uploadRoot, row.storage_key), { force: true }).catch(() => undefined);
      await this.database.query("UPDATE temporary_creation_uploads SET deleted_at=CURRENT_TIMESTAMP WHERE id=$1 AND deleted_at IS NULL", [row.id]);
    }
    return expired.rows.length;
  }

  async remove(actor: Actor, uploadId: string) {
    const result = await this.database.query<UploadRow>("SELECT id,user_id,file_name,mime_type,storage_key,size_bytes,expires_at FROM temporary_creation_uploads WHERE id=$1 AND deleted_at IS NULL", [uploadId]);
    const row = result.rows[0];
    if (!row) throw new NotFoundException("临时文件不存在或已删除");
    if (row.user_id !== actor.id) throw new ForbiddenException("无权删除该临时文件");
    await rm(path.join(getEnvironment().uploadRoot, row.storage_key), { force: true });
    await this.database.query("UPDATE temporary_creation_uploads SET deleted_at=CURRENT_TIMESTAMP WHERE id=$1 AND deleted_at IS NULL", [uploadId]);
    return { id: uploadId, deleted: true };
  }

  private present(row: UploadRow) { return { id: row.id, fileName: row.file_name, mimeType: row.mime_type, sizeBytes: Number(row.size_bytes), expiresAt: row.expires_at.toISOString(), downloadUrl: `/api/creation-files/${row.id}/download` }; }
}

async function extractAgentText(filePath: string, mimeType: string) {
  if (["text/plain", "text/markdown", "text/csv"].includes(mimeType)) return (await readFile(filePath)).toString("utf8");
  if (mimeType === "application/pdf") {
    const result = await execFile("pdftotext", [filePath, "-"], { maxBuffer: 2 * 1024 * 1024, timeout: 10000 });
    return result.stdout;
  }
  if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || mimeType === "application/vnd.openxmlformats-officedocument.presentationml.presentation") {
    const zip = new AdmZip(await readFile(filePath));
    return zip.getEntries()
      .filter((entry) => /^(word\/document|word\/header|word\/footer|ppt\/slides\/slide)\d*\.xml$/i.test(entry.entryName))
      .map((entry) => entry.getData().toString("utf8").replace(/<[^>]+>/g, " ").replace(/\s+/g, " "))
      .join("\n");
  }
  return "";
}
