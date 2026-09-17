import "reflect-metadata";
import "dotenv/config";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, NestFastifyApplication } from "@nestjs/platform-fastify";
import multipart from "@fastify/multipart";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { caseUploadPolicy } from "./common/upload-policy";
import { AppModule } from "./app.module";
import { getEnvironment } from "./common/environment";
import { ApiExceptionFilter } from "./common/api-exception.filter";
import { apiRateLimitHook } from "./common/rate-limit";

async function bootstrap() {
  const environment = getEnvironment();
  caseUploadPolicy(); // Fail fast on invalid configured video limits.
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: environment.nodeEnv !== "test", bodyLimit: 1_048_576, genReqId: () => randomUUID() }),
  );

  app.setGlobalPrefix("api");
  app.useGlobalFilters(new ApiExceptionFilter());
  app.enableShutdownHooks();
  app.enableCors({
    origin: environment.corsOrigins,
    credentials: true,
  });

  if (environment.fileUploadsEnabled) {
    await mkdir(environment.uploadRoot, { recursive: true, mode: 0o700 });
    await app.register(multipart, {
      limits: { files: 1, fields: 0, parts: 1, fileSize: 10 * 1024 * 1024 },
      throwFileSizeLimit: true,
    });
  }

  const fastify = app.getHttpAdapter().getInstance();
  fastify.addHook("onRequest", async (request, reply) => { reply.header("X-Request-ID", request.id); });
  fastify.addHook("onRequest", async (request, reply) => {
    const isWrite = !["GET", "HEAD", "OPTIONS"].includes(request.method);
    const hasSession = request.headers.cookie?.includes("artedu_session=");
    if (!isWrite || !hasSession) return;
    const origin = request.headers.origin;
    if (!origin || !environment.corsOrigins.includes(origin)) {
      return reply.code(403).send({ statusCode: 403, message: "跨站写请求被拒绝", requestId: request.id });
    }
  });
  fastify.addHook("onRequest", apiRateLimitHook);
  fastify.addHook("onSend", async (_request, reply, payload) => {
    reply.header("Cache-Control", "no-store");
    // 默认策略只覆盖"没有自己声明 CSP"的接口。工作区预览页需要放行同源 CSS/JS，
    // 如果在 onSend 里无条件重设，就会把路由设置的策略覆盖掉——那样沙箱页面
    // 会连自己的样式表和脚本都加载不了，表现为"生成的网页完全没有样式"。
    if (!reply.getHeader("Content-Security-Policy")) {
      reply.header("Content-Security-Policy", "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
    }
    reply.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    reply.header("Referrer-Policy", "strict-origin-when-cross-origin");
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("X-Frame-Options", "DENY");
    if (environment.nodeEnv === "production") {
      reply.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    }
    return payload;
  });

  await app.listen({ port: environment.port, host: environment.host });
  Logger.log(`ArtEdu API listening on http://${environment.host}:${environment.port}/api`, "Bootstrap");
}

void bootstrap();
