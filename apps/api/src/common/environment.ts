import { z } from "zod";
import path from "node:path";

const optionalUrl = z.preprocess(
  (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
  z.string().url().optional(),
);

const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  HOST: z.string().min(1).default("127.0.0.1"),
  CORS_ORIGIN: z.string().optional(),
  ENABLE_LOCAL_AUTH: z.enum(["true", "false"]).default("false"),
  LOCAL_SESSION_DAYS: z.coerce.number().int().min(1).max(30).default(7),
  LOCAL_SESSION_IDLE_HOURS: z.coerce.number().int().min(1).max(24).default(12),
  LOCAL_BRIDGE_TOKEN_DAYS: z.coerce.number().int().min(1).max(90).default(30),
  ENABLE_FILE_UPLOADS: z.enum(["true", "false"]).default("false"),
  UPLOAD_ROOT: z.string().trim().min(1).optional(),
  TEMPORARY_UPLOAD_QUOTA_MB: z.coerce.number().int().min(10).max(2048).default(200),
  TEMPORARY_UPLOAD_RETENTION_HOURS: z.coerce.number().int().min(1).max(720).default(72),
  MODEL_EXECUTION_ENABLED: z.enum(["true", "false"]).default("false"),
  MODEL_PROVIDERS_JSON: z.string().optional(),
  RAG_ENABLED: z.enum(["true", "false"]).default("false"),
  RAG_EMBEDDING_BASE_URL: optionalUrl,
  RAG_EMBEDDING_MODEL: z.string().trim().max(200).optional(),
  RAG_EMBEDDING_API_KEY: z.string().trim().max(2000).optional(),
  RAG_EMBEDDING_DIMENSIONS: z.coerce.number().int().min(64).max(4096).default(1024),
  RAG_MIN_SIMILARITY: z.coerce.number().min(0).max(1).default(0.62),
  RAG_WEB_FALLBACK_ENABLED: z.enum(["true", "false"]).default("true"),
  AGENT_ALERT_KEYWORDS: z.string().optional(),
  AGENT_BLOCK_KEYWORDS: z.string().optional(),
});

export interface Environment {
  nodeEnv: "development" | "test" | "production";
  port: number;
  host: string;
  corsOrigins: string[];
  localAuthenticationEnabled: boolean;
  localSessionDays: number;
  localSessionIdleHours: number;
  localBridgeTokenDays: number;
  fileUploadsEnabled: boolean;
  uploadRoot: string;
  temporaryUploadQuotaBytes: number;
  temporaryUploadRetentionHours: number;
  modelExecutionEnabled: boolean;
  modelProvidersJson?: string;
  ragEnabled: boolean;
  ragEmbeddingBaseUrl?: string;
  ragEmbeddingModel?: string;
  ragEmbeddingApiKey?: string;
  ragEmbeddingDimensions: number;
  ragMinSimilarity: number;
  ragWebFallbackEnabled: boolean;
  agentAlertKeywords: string[];
  agentBlockedKeywords: string[];
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

  if (parsed.NODE_ENV === "production" && parsed.ENABLE_LOCAL_AUTH === "true") {
    throw new Error("生产环境禁止启用本地账号登录；请接入学校 SSO 或受管身份提供方");
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

  if (parsed.RAG_ENABLED === "true" && (!parsed.RAG_EMBEDDING_BASE_URL || !parsed.RAG_EMBEDDING_MODEL || !parsed.RAG_EMBEDDING_API_KEY)) {
    throw new Error("启用 RAG 时必须配置 RAG_EMBEDDING_BASE_URL、RAG_EMBEDDING_MODEL 与 RAG_EMBEDDING_API_KEY");
  }

  return {
    nodeEnv: parsed.NODE_ENV,
    port: parsed.PORT,
    host: parsed.HOST,
    corsOrigins: configuredCorsOrigins.length > 0 ? configuredCorsOrigins : ["http://localhost:4173"],
    localAuthenticationEnabled: parsed.ENABLE_LOCAL_AUTH === "true",
    localSessionDays: parsed.LOCAL_SESSION_DAYS,
    localSessionIdleHours: parsed.LOCAL_SESSION_IDLE_HOURS,
    localBridgeTokenDays: parsed.LOCAL_BRIDGE_TOKEN_DAYS,
    fileUploadsEnabled: parsed.ENABLE_FILE_UPLOADS === "true",
    uploadRoot,
    temporaryUploadQuotaBytes: parsed.TEMPORARY_UPLOAD_QUOTA_MB * 1024 * 1024,
    temporaryUploadRetentionHours: parsed.TEMPORARY_UPLOAD_RETENTION_HOURS,
    modelExecutionEnabled: parsed.MODEL_EXECUTION_ENABLED === "true",
    modelProvidersJson: parsed.MODEL_PROVIDERS_JSON,
    ragEnabled: parsed.RAG_ENABLED === "true",
    ragEmbeddingBaseUrl: parsed.RAG_EMBEDDING_BASE_URL,
    ragEmbeddingModel: parsed.RAG_EMBEDDING_MODEL,
    ragEmbeddingApiKey: parsed.RAG_EMBEDDING_API_KEY,
    ragEmbeddingDimensions: parsed.RAG_EMBEDDING_DIMENSIONS,
    ragMinSimilarity: parsed.RAG_MIN_SIMILARITY,
    ragWebFallbackEnabled: parsed.RAG_WEB_FALLBACK_ENABLED === "true",
    agentAlertKeywords: splitKeywords(parsed.AGENT_ALERT_KEYWORDS),
    agentBlockedKeywords: splitKeywords(parsed.AGENT_BLOCK_KEYWORDS),
  };
}

function splitKeywords(value?: string) {
  return (value ?? "").split(",").map((keyword) => keyword.trim()).filter(Boolean);
}
