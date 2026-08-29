import "reflect-metadata";
import "dotenv/config";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, NestFastifyApplication } from "@nestjs/platform-fastify";
import { AppModule } from "./app.module";
import { getEnvironment } from "./common/environment";

async function bootstrap() {
  const environment = getEnvironment();
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: environment.nodeEnv !== "test" }),
  );

  app.setGlobalPrefix("api");
  app.enableCors({
    origin: environment.corsOrigins,
    credentials: true,
  });

  const fastify = app.getHttpAdapter().getInstance();
  fastify.addHook("onSend", async (_request, reply, payload) => {
    reply.header("Referrer-Policy", "strict-origin-when-cross-origin");
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("X-Frame-Options", "SAMEORIGIN");
    if (environment.nodeEnv === "production") {
      reply.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    }
    return payload;
  });

  await app.listen({ port: environment.port, host: environment.host });
  Logger.log(`ArtEdu API listening on http://${environment.host}:${environment.port}/api`, "Bootstrap");
}

void bootstrap();
