import { z } from "zod";

const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  HOST: z.string().min(1).default("127.0.0.1"),
  CORS_ORIGIN: z.string().optional(),
  ENABLE_DEVELOPMENT_AUTH: z.enum(["true", "false"]).default("false"),
});

export interface Environment {
  nodeEnv: "development" | "test" | "production";
  port: number;
  host: string;
  corsOrigins: string[];
  developmentAuthenticationEnabled: boolean;
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

  if (parsed.NODE_ENV === "production" && parsed.ENABLE_DEVELOPMENT_AUTH === "true") {
    throw new Error("生产环境禁止开启 ENABLE_DEVELOPMENT_AUTH");
  }

  return {
    nodeEnv: parsed.NODE_ENV,
    port: parsed.PORT,
    host: parsed.HOST,
    corsOrigins: configuredCorsOrigins.length > 0 ? configuredCorsOrigins : ["http://localhost:4173"],
    developmentAuthenticationEnabled: parsed.ENABLE_DEVELOPMENT_AUTH === "true",
  };
}
