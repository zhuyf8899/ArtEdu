import { BadRequestException, PayloadTooLargeException } from "@nestjs/common";
import type { MultipartFile } from "@fastify/multipart";
import { createHash, randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const allowedTypes = new Map([
  ["image/jpeg", "image"],
  ["image/png", "image"],
  ["image/webp", "image"],
  ["application/pdf", "document"],
]);

export interface StoredUpload {
  storageKey: string;
  fileName: string;
  mimeType: "image/jpeg" | "image/png" | "image/webp" | "application/pdf";
  assetType: "image" | "document";
  sizeBytes: number;
  sha256: string;
}

export async function storePrivateUpload(part: MultipartFile, root: string): Promise<StoredUpload> {
  if (part.fieldname !== "file") throw new BadRequestException("只允许提交名为 file 的单个文件字段");
  const uploadRoot = path.resolve(root);
  await mkdir(uploadRoot, { recursive: true, mode: 0o700 });
  const storageKey = `${randomUUID()}-${randomUUID()}`;
  const temporaryPath = path.join(uploadRoot, `.${storageKey}.tmp`);
  const destinationPath = path.join(uploadRoot, storageKey);
  const digest = createHash("sha256");
  let bytes = 0;
  let header = Buffer.alloc(0);

  const inspect = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      bytes += chunk.length;
      if (bytes > MAX_UPLOAD_BYTES) return callback(new PayloadTooLargeException("文件不能超过 10 MB"));
      if (header.length < 16) header = Buffer.concat([header, chunk]).subarray(0, 16);
      digest.update(chunk);
      callback(null, chunk);
    },
  });

  try {
    await pipeline(part.file, inspect, createWriteStream(temporaryPath, { flags: "wx", mode: 0o600 }));
    if (part.file.truncated) throw new PayloadTooLargeException("文件不能超过 10 MB");
    const mimeType = detectUploadMimeType(header);
    if (!mimeType || mimeType !== part.mimetype || !allowedTypes.has(mimeType)) {
      throw new BadRequestException("文件内容与声明类型不一致，或类型不被允许");
    }
    await rename(temporaryPath, destinationPath);
    return {
      storageKey,
      fileName: safeFileName(part.filename, mimeType),
      mimeType,
      assetType: allowedTypes.get(mimeType) as "image" | "document",
      sizeBytes: bytes,
      sha256: digest.digest("hex"),
    };
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
    await rm(destinationPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

export function detectUploadMimeType(header: Buffer): StoredUpload["mimeType"] | undefined {
  if (header.length >= 3 && header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) return "image/jpeg";
  if (header.length >= 8 && header.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (header.length >= 12 && header.subarray(0, 4).toString("ascii") === "RIFF" && header.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  if (header.length >= 5 && header.subarray(0, 5).toString("ascii") === "%PDF-") return "application/pdf";
  return undefined;
}

function safeFileName(value: string | undefined, mimeType: StoredUpload["mimeType"]) {
  const extension = ({ "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "application/pdf": ".pdf" } as const)[mimeType];
  const base = path.basename(value ?? "upload").replace(/[^A-Za-z0-9._-]/g, "_").replace(/^\.+/, "").slice(0, 120) || "upload";
  return base.toLowerCase().endsWith(extension) ? base : `${base}${extension}`;
}
