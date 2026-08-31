import { z } from "zod";
import path from "node:path";

const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  HOST: z.string().min(1).default("127.0.0.1"),
  CORS_ORIGIN: z.string().optional(),
  ENABLE_LOCAL_AUTH: z.enum(["true", "false"]).default("false"),
  LOCAL_SESSION_DAYS: z.coerce.number().int().min(1).max(30).default(7),
  ENABLE_FILE_UPLOADS: z.enum(["true", "false"]).default("false"),
  UPLOAD_ROOT: z.string().trim().min(1).optional(),
  MODEL_EXECUTION_ENABLED: z.enum(["true", "false"]).default("false"),
});

export interface Environment {
  nodeEnv: "development" | "test" | "production";
  port: number;
  host: string;
  corsOrigins: string[];
  localAuthenticationEnabled: boolean;
  localSessionDays: number;
  fileUploadsEnabled: boolean;
  uploadRoot: string;
  modelExecutionEnabled: boolean;
}

export function getEnvironment(): Environment {
  const parsed = environmentSchema.parse(process.env);
  const configuredCorsOrigins = (parsed.CORS_ORIGIN ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (parsed.NODE_ENV === "production" && configuredCorsOrigins.length === 0) {
    throw new Error("生产环境必须配置至少一个 CORS_ORIGIN");
  }

  for (const origin of configuredCorsOrigins) {
    let url: URL;
    try {
      url = new URL(origin);
    } catch {
      throw new Error(`CORS_ORIGIN 包含无效来源: ${origin}`);
    }
    if (!/^https?:$/.test(url.protocol) || url.origin !== origin || url.username || url.password) {
      throw new Error(`CORS_ORIGIN 必须是无凭据的完整 HTTP(S) 来源: ${origin}`);
    }
    if (parsed.NODE_ENV === "production" && url.protocol !== "https:") {
      throw new Error(`生产环境 CORS_ORIGIN 必须使用 HTTPS: ${origin}`);
    }
  }

  const uploadRoot = path.resolve(parsed.UPLOAD_ROOT ?? path.join(process.cwd(), "data", "uploads"));
  if (parsed.NODE_ENV === "production" && parsed.ENABLE_FILE_UPLOADS === "true" && !parsed.UPLOAD_ROOT) {
    throw new Error("生产环境启用文件上传时必须显式配置 UPLOAD_ROOT");
  }

  return {
    nodeEnv: parsed.NODE_ENV,
    port: parsed.PORT,
    host: parsed.HOST,
    corsOrigins: configuredCorsOrigins.length > 0 ? configuredCorsOrigins : ["http://localhost:4173"],
    localAuthenticationEnabled: parsed.ENABLE_LOCAL_AUTH === "true",
    localSessionDays: parsed.LOCAL_SESSION_DAYS,
    fileUploadsEnabled: parsed.ENABLE_FILE_UPLOADS === "true",
    uploadRoot,
    modelExecutionEnabled: parsed.MODEL_EXECUTION_ENABLED === "true",
  };
}
