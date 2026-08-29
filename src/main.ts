import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AppModule } from './app.module.js';
import { parseCorsOrigins } from './config/environment.validation.js';
import { createRateLimitMiddleware } from './security/rate-limit.middleware.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);
  const corsOrigins = parseCorsOrigins(config.get<string>('CORS_ORIGINS'));

  app.use(helmet());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      disableErrorMessages: config.get<string>('NODE_ENV') === 'production',
    }),
  );
  app.use(
    createRateLimitMiddleware({
      limit: config.getOrThrow<number>('THROTTLE_LIMIT'),
      windowMs: config.getOrThrow<number>('THROTTLE_TTL_MS'),
    }),
  );

  if (config.get<string>('TRUST_PROXY') === 'loopback') {
    app.set('trust proxy', 'loopback');
  }

  if (corsOrigins.length > 0) {
    app.enableCors({
      origin: corsOrigins,
      credentials: true,
      methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Authorization', 'Content-Type'],
    });
  }

  app.enableShutdownHooks();
  await app.listen(
    config.getOrThrow<number>('PORT'),
    config.getOrThrow<string>('APP_HOST'),
  );
}
await bootstrap();
