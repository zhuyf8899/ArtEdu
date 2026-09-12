import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { RagController } from "./rag.controller";
import { RagService } from "./rag.service";
import { RagWorkerService } from "./rag.worker";

@Module({
  imports: [AuthModule],
  controllers: [RagController],
  providers: [RagService, RagWorkerService],
  exports: [RagService],
})
export class RagModule {}
