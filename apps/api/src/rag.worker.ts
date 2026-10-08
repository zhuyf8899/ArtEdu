/**
 * 【RAG Worker 进程入口】创建 NestJS 应用上下文并启动 PDF 索引循环。索引是把课件解析、切块并生成可检索向量；具体处理见 modules/rag/rag.worker.ts，启用条件由运行配置控制。
 */
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
