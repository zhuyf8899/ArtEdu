import { TemporaryWorkflowService } from "./temporary-workflow.service";
import { TemporaryWorkflowController } from "./temporary-workflow.controller";
import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { DatabaseModule } from "../database/database.module";
import { GenerationModule } from "../generation/generation.module";
import { CreationStorageModule } from "../creation-storage/creation-storage.module";
import { ComfyService } from './comfy.service';
import { ComfyController } from './comfy.controller';
import { StudioController } from "./studio.controller";
import { StudioService } from "./studio.service";
// Tool submissions have a separate moderated queue; accepting does not publish a directory entry.
import { ToolRecommendationsController,ToolRecommendationsService } from './tool-recommendations';

@Module({
  imports: [AuthModule, DatabaseModule, GenerationModule, CreationStorageModule],
  controllers: [StudioController, ComfyController, ToolRecommendationsController, TemporaryWorkflowController],
  providers: [StudioService, ComfyService, ToolRecommendationsService, TemporaryWorkflowService],
  exports: [StudioService, ComfyService, TemporaryWorkflowService],
})
export class StudioModule {}
