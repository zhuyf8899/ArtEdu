import "reflect-metadata";
import "dotenv/config";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, NestFastifyApplication } from "@nestjs/platform-fastify";
import { randomUUID } from "node:crypto";
import { AppModule } from "./app.module";
import { getEnvironment } from "./common/environment";
import { apiRateLimitHook } from "./common/rate-limit";
import { ApiExceptionFilter } from "./common/api-exception.filter";

async function bootstrap() {
  const environment = getEnvironment();
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      logger: environment.nodeEnv !== "test",
      bodyLimit: 1_048_576,
      genReqId: () => randomUUID(),
    }),
  );

  app.setGlobalPrefix("api");
  app.useGlobalFilters(new ApiExceptionFilter());
  app.enableShutdownHooks();
  app.enableCors({
    origin: environment.corsOrigins,
    credentials: true,
  });

  const fastify = app.getHttpAdapter().getInstance();
  fastify.addHook("onRequest", async (request, reply) => {
    reply.header("X-Request-ID", request.id);
  });
  fastify.addHook("onRequest", apiRateLimitHook);
  fastify.addHook("onSend", async (_request, reply, payload) => {
    reply.header("Cache-Control", "no-store");
    reply.header("Content-Security-Policy", "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
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
