/**
 * 【生成 Worker 进程入口】创建不监听 HTTP 的 NestJS 应用上下文，然后运行 GenerationWorkerService。当前服务只轮询并打印提示，不领取任务；实际生成执行入口见 generation.service.ts。
 */
import "reflect-metadata";
import "dotenv/config";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { getEnvironment } from "./common/environment";
import { GenerationWorkerService } from "./modules/generation/generation.worker";

async function bootstrapWorker() {
  getEnvironment();
  const context = await NestFactory.createApplicationContext(AppModule);
  const worker = context.get(GenerationWorkerService);
  await worker.runForever();
}

void bootstrapWorker();
