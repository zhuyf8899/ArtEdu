import { z } from "zod";

const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  HOST: z.string().min(1).default("127.0.0.1"),
  CORS_ORIGIN: z.string().optional(),
  ENABLE_DEVELOPMENT_AUTH: z.enum(["true", "false"]).default("false"),
  MODEL_EXECUTION_ENABLED: z.enum(["true", "false"]).default("false"),
});

export interface Environment {
  nodeEnv: "development" | "test" | "production";
  port: number;
  host: string;
  corsOrigins: string[];
  developmentAuthenticationEnabled: boolean;
  modelExecutionEnabled: boolean;
}

export function getEnvironment(): Environment {
  const parsed = environmentSchema.parse(process.env);
  const configuredCorsOrigins = (parsed.CORS_ORIGIN ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  for (const origin of configuredCorsOrigins) {
    let url: URL;
    try {
      url = new URL(origin);
    } catch {
      throw new Error(`CORS_ORIGIN 格式不合法：${origin}`);
    }
    if (!['http:', 'https:'].includes(url.protocol) || url.origin !== origin || url.username || url.password) {
      throw new Error(`CORS_ORIGIN 必须是无路径、无凭据的 http(s) Origin：${origin}`);
    }
  }

  if (parsed.NODE_ENV === "production" && configuredCorsOrigins.length === 0) {
    throw new Error("生产环境必须配置至少一个 CORS_ORIGIN");
  }

  if (parsed.NODE_ENV === "production" && parsed.ENABLE_DEVELOPMENT_AUTH === "true") {
    throw new Error("生产环境禁止开启 ENABLE_DEVELOPMENT_AUTH");
  }

  if (parsed.ENABLE_DEVELOPMENT_AUTH === "true" && parsed.NODE_ENV !== "development") {
    throw new Error("ENABLE_DEVELOPMENT_AUTH 只能在 development 环境启用");
  }

  if (parsed.ENABLE_DEVELOPMENT_AUTH === "true" && !isLoopbackHost(parsed.HOST)) {
    throw new Error("启用开发身份认证时，HOST 必须为本机回环地址，避免 x-user-id 暴露到网络");
  }

  return {
    nodeEnv: parsed.NODE_ENV,
    port: parsed.PORT,
    host: parsed.HOST,
    corsOrigins: configuredCorsOrigins.length > 0 ? configuredCorsOrigins : ["http://localhost:4173"],
    developmentAuthenticationEnabled: parsed.ENABLE_DEVELOPMENT_AUTH === "true",
    modelExecutionEnabled: parsed.MODEL_EXECUTION_ENABLED === "true",
  };
}

function isLoopbackHost(host: string) {
  return host === "localhost" || host === "::1" || /^127(?:\.\d{1,3}){3}$/.test(host);
}
