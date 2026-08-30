import { Module } from "@nestjs/common";
import { AdminModule } from "./modules/admin/admin.module";
import { AuthModule } from "./modules/auth/auth.module";
import { DatabaseModule } from "./modules/database/database.module";
import { GenerationModule } from "./modules/generation/generation.module";
import { HealthController } from "./modules/health/health.controller";
import { PortalModule } from "./modules/portal/portal.module";
import { ContentModule } from "./modules/content/content.module";

@Module({
  imports: [DatabaseModule, AuthModule, AdminModule, GenerationModule, PortalModule, ContentModule],
  controllers: [HealthController],
})
export class AppModule {}
