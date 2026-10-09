import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { DatabaseModule } from "../database/database.module";
import { GenerationModule } from "../generation/generation.module";
import { CreationStorageModule } from "../creation-storage/creation-storage.module";
import { ComfyService } from './comfy.service';
import { ComfyController } from './comfy.controller';
import { StudioController } from "./studio.controller";
import { StudioService } from "./studio.service";

@Module({
  imports: [AuthModule, DatabaseModule, GenerationModule, CreationStorageModule],
  controllers: [StudioController, ComfyController],
  providers: [StudioService, ComfyService],
  exports: [StudioService, ComfyService],
})
export class StudioModule {}
