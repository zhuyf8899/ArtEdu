import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { DatabaseModule } from "../database/database.module";
import { StudioController } from "./studio.controller";
import { StudioService } from "./studio.service";

@Module({
  imports: [AuthModule, DatabaseModule],
  controllers: [StudioController],
  providers: [StudioService],
})
export class StudioModule {}
