import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { GenerationModule } from "../generation/generation.module";
import { PortalController } from "./portal.controller";
import { PortalService } from "./portal.service";

@Module({
  imports: [AuthModule, GenerationModule],
  controllers: [PortalController],
  providers: [PortalService],
})
export class PortalModule {}
