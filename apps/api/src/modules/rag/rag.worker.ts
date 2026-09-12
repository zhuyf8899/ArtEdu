import { Injectable, Logger } from "@nestjs/common";
import { RagService } from "./rag.service";

@Injectable()
export class RagWorkerService {
  private readonly logger = new Logger(RagWorkerService.name);
  constructor(private readonly rag: RagService) {}

  async runForever() {
    // 只保留 Worker 进程契约；未配置校内 embedding Provider 时不领取任务，避免资料外发或标记失败。
    this.logger.log("RAG Worker 已启动，等待校内 embedding Provider 接入");
    await new Promise<void>(() => undefined);
  }
}
