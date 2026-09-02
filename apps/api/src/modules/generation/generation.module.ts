import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { GenerationController } from "./generation.controller";
import { GenerationRepository } from "./generation.repository";
import { GenerationService } from "./generation.service";
import { GenerationWorkerService } from "./generation.worker";
import { ModelRegistry } from "./model-registry";

@Module({
  imports: [AuthModule],
  controllers: [GenerationController],
  providers: [GenerationRepository, GenerationService, GenerationWorkerService, ModelRegistry],
  exports: [GenerationWorkerService, ModelRegistry],
})
export class GenerationModule {}
