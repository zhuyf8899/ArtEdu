import { CreationStorageModule } from "../creation-storage/creation-storage.module";
import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { GenerationController } from "./generation.controller";
import { GenerationRepository } from "./generation.repository";
import { GenerationService } from "./generation.service";
import { GenerationWorkerService } from "./generation.worker";
import { ModelRegistry } from "./model-registry";
import { OfficeExportService } from "./office-export.service";

@Module({
  imports: [AuthModule, CreationStorageModule],
  controllers: [GenerationController],
  providers: [GenerationRepository, GenerationService, GenerationWorkerService, ModelRegistry, OfficeExportService],
  exports: [GenerationWorkerService, ModelRegistry, GenerationService],
})
export class GenerationModule {}
