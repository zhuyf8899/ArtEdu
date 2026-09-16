import { BadRequestException, PayloadTooLargeException } from "@nestjs/common";
import type { MultipartFile } from "@fastify/multipart";
import { createHash, randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, rename, rm } from "node:fs/promises";
import path from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const allowedTypes = {
  "image/jpeg": "image",
  "image/png": "image",
  "image/webp": "image",
  "video/mp4": "video",
  "video/webm": "video",
  "application/pdf": "document",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "document",
  "text/plain": "document",
  "text/markdown": "document",
  "text/csv": "document",
} as const;

export type PrivateUploadMimeType = keyof typeof allowedTypes;

export interface StoredUpload {
  storageKey: string;
  fileName: string;
  mimeType: PrivateUploadMimeType;
  assetType: "image" | "video" | "document";
  sizeBytes: number;
  sha256: string;
}

export async function storePrivateUpload(
  part: MultipartFile,
  root: string,
  permittedMimeTypes: readonly PrivateUploadMimeType[] = Object.keys(allowedTypes) as PrivateUploadMimeType[],
  storagePrefix = "",
  videoMaxBytes = MAX_UPLOAD_BYTES,
): Promise<StoredUpload> {
  if (part.fieldname !== "file") throw new BadRequestException("只允许提交名为 file 的单个文件字段");
  const maxBytes = ["video/mp4", "video/webm"].includes(part.mimetype) ? videoMaxBytes : MAX_UPLOAD_BYTES;
  const sizeError = () => new PayloadTooLargeException(`该类型文件不能超过 ${maxBytes / 1024 / 1024} MiB`);
  const uploadRoot = path.resolve(root);
  await mkdir(uploadRoot, { recursive: true, mode: 0o700 });
  const storageKey = createStorageKey(storagePrefix);
  const destinationPath = path.join(uploadRoot, ...storageKey.split("/"));
  const temporaryPath = path.join(path.dirname(destinationPath), `.${path.basename(destinationPath)}.tmp`);
  await mkdir(path.dirname(destinationPath), { recursive: true, mode: 0o700 });
  const digest = createHash("sha256");
  let bytes = 0;
  let header = Buffer.alloc(0);

  const inspect = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      bytes += chunk.length;
      if (bytes > maxBytes) return callback(sizeError());
      if (header.length < 16) header = Buffer.concat([header, chunk]).subarray(0, 16);
      digest.update(chunk);
      callback(null, chunk);
    },
  });

  try {
    await pipeline(part.file, inspect, createWriteStream(temporaryPath, { flags: "wx", mode: 0o600 }));
    if (part.file.truncated) throw sizeError();
    // DOCX/PPTX are ZIP containers. Inspecting their entry names avoids extracting untrusted content.
    // Large videos are streamed to disk: never read the full 100 MiB into memory.
    let mimeType = detectUploadMimeType(header);
    if (!mimeType && bytes <= MAX_UPLOAD_BYTES) {
      const fileBytes = await readFile(temporaryPath);
      mimeType = detectOfficeMimeType(fileBytes) ?? detectTextMimeType(part.mimetype, fileBytes);
    }
    if (!mimeType || mimeType !== part.mimetype || !permittedMimeTypes.includes(mimeType)) {
      throw new BadRequestException("文件内容与声明类型不一致，或类型不被允许");
    }
    await rename(temporaryPath, destinationPath);
    return {
      storageKey,
      fileName: safeFileName(part.filename, mimeType),
      mimeType,
      assetType: allowedTypes[mimeType],
      sizeBytes: bytes,
      sha256: digest.digest("hex"),
    };
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
    await rm(destinationPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

function createStorageKey(prefix: string) {
  const normalized = prefix.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  if (normalized && !normalized.split("/").every((part) => /^[A-Za-z0-9_-]{1,160}$/.test(part))) {
    throw new BadRequestException("无效的文件存储目录");
  }
  const name = `${randomUUID()}-${randomUUID()}`;
  return normalized ? `${normalized}/${name}` : name;
}

export function detectUploadMimeType(header: Buffer): PrivateUploadMimeType | undefined {
  if (header.length >= 3 && header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) return "image/jpeg";
  if (header.length >= 8 && header.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (header.length >= 12 && header.subarray(0, 4).toString("ascii") === "RIFF" && header.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  if (header.length >= 5 && header.subarray(0, 5).toString("ascii") === "%PDF-") return "application/pdf";
  if (header.length >= 8 && header.subarray(4, 8).toString("ascii") === "ftyp") return "video/mp4";
  if (header.length >= 4 && header.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) return "video/webm";
  return undefined;
}

function detectOfficeMimeType(file: Buffer): PrivateUploadMimeType | undefined {
  if (file.length < 4 || file.subarray(0, 4).toString("ascii") !== "PK\x03\x04") return undefined;
  const manifest = file.toString("latin1");
  if (!manifest.includes("[Content_Types].xml")) return undefined;
  if (manifest.includes("word/")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (manifest.includes("ppt/")) return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
  return undefined;
}

function detectTextMimeType(declaredMimeType: string, file: Buffer): PrivateUploadMimeType | undefined {
  if (!["text/plain", "text/markdown", "text/csv"].includes(declaredMimeType)) return undefined;
  // 拒绝 NUL 字节，避免把二进制伪装成文本；再通过 UTF-8 round-trip 验证。
  if (file.includes(0)) return undefined;
  const text = file.toString("utf8");
  return Buffer.from(text, "utf8").equals(file) ? declaredMimeType as PrivateUploadMimeType : undefined;
}

/**
 * 上传时保留原始文件名，只做安全清洗。
 *
 * 之前的实现用 /[^A-Za-z0-9._-]/ 过滤，中文名会被整段替换成下划线，
 * 审核区和下载下来的文件都变成 "_____.png"，看起来像是文件坏了。
 * 现在只清除控制字符、路径分隔符和文件系统保留字符，其余（含中文）原样保留。
 */
export function safeFileName(value: string | undefined, mimeType: StoredUpload["mimeType"]) {
  const extension = ({ "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "video/mp4": ".mp4", "video/webm": ".webm", "application/pdf": ".pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx", "application/vnd.openxmlformats-officedocument.presentationml.presentation": ".pptx", "text/plain": ".txt", "text/markdown": ".md", "text/csv": ".csv" } as const)[mimeType];
  // 统一分隔符后再取最后一段，这样 Windows 反斜杠路径也不会被当成文件名。
  const leaf = String(value ?? "").replace(/\\/g, "/").split("/").pop() ?? "";
  const cleaned = leaf
    .replace(/[\u0000-\u001f\u007f]/g, "")            // 控制字符
    .replace(/[<>:"|?*]/g, "_")                        // 文件系统保留字符（含 / 已被拆分）
    .replace(/^\.+/, "")                               // 前导点：避免隐藏文件与 .. 语义
    .trim();
  // 去掉原有扩展名后统一补上按真实类型判定的扩展名，避免 "图.jpg" 变成 "图.jpg.png"。
  // 截断按码位进行，别把 emoji 之类的代理对劈成半个字符。
  const withoutExtension = cleaned.replace(/\.[A-Za-z0-9]{1,5}$/u, "");
  const base = Array.from(withoutExtension || cleaned).slice(0, 120).join("") || "upload";
  return `${base}${extension}`;
}
