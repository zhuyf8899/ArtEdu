import { Injectable, Logger } from "@nestjs/common";
import { getEnvironment } from "../../common/environment";

/**
 * 任务 worker 与 HTTP API 使用不同进程启动（npm run worker）。
 * 此进程目前只轮询配置并记录提示，processOnce 不领取或执行任务。
 * 实际服务端生成由 GenerationService.runJob 执行；本地 Agent 与 GPU 任务使用各自的 Bridge 领取接口。
 */
@Injectable()
export class GenerationWorkerService {
  private readonly logger = new Logger(GenerationWorkerService.name);

  async processOnce() {
    if (!getEnvironment().modelExecutionEnabled) {
      this.logger.warn("模型执行服务未配置，worker 跳过领取任务");
      return false;
    }
    this.logger.warn("云端模型直连已禁用；生成任务应通过 Local Model Bridge 执行");
    return false;
  }

  async runForever(intervalMs = 1000) {
    this.logger.log("Generation worker is ready");
    for (;;) {
      const processed = await this.processOnce();
      if (!processed) await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }

}
