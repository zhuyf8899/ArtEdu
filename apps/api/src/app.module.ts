import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { AdminModule } from "./modules/admin/admin.module";
import { AgentModule } from "./modules/agent/agent.module";
import { AuthModule } from "./modules/auth/auth.module";
import { CoursesModule } from "./modules/courses/courses.module";
import { CreationStorageModule } from "./modules/creation-storage/creation-storage.module";
import { DatabaseModule } from "./modules/database/database.module";
import { GenerationModule } from "./modules/generation/generation.module";
import { HealthController } from "./modules/health/health.controller";
import { LearningModule } from "./modules/learning/learning.module";
import { LocalBridgeModule } from "./modules/local-bridge/local-bridge.module";
import { PortalModule } from "./modules/portal/portal.module";
import { StudioModule } from "./modules/studio/studio.module";
import { AuthenticationGuard } from "./modules/auth/authentication.guard";

@Module({
  imports: [DatabaseModule, AuthModule, AdminModule, AgentModule, CoursesModule, CreationStorageModule, GenerationModule, LearningModule, LocalBridgeModule, PortalModule, StudioModule],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: AuthenticationGuard }],
})
export class AppModule {}
