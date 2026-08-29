import "reflect-metadata";
import "dotenv/config";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { GenerationWorkerService } from "./modules/generation/generation.worker";

async function bootstrapWorker() {
  const context = await NestFactory.createApplicationContext(AppModule);
  const worker = context.get(GenerationWorkerService);
  await worker.runForever();
}

void bootstrapWorker();
