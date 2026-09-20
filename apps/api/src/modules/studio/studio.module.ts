import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { DatabaseModule } from "../database/database.module";
import { GenerationModule } from "../generation/generation.module";
import { StudioController } from "./studio.controller";
import { StudioService } from "./studio.service";

@Module({
  imports: [AuthModule, DatabaseModule, GenerationModule],
  controllers: [StudioController],
  providers: [StudioService],
  exports: [StudioService],
})
export class StudioModule {}
