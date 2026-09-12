import "reflect-metadata";
import "dotenv/config";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { RagWorkerService } from "./modules/rag/rag.worker";

async function bootstrapWorker() {
  const context = await NestFactory.createApplicationContext(AppModule);
  await context.get(RagWorkerService).runForever();
}

void bootstrapWorker();
