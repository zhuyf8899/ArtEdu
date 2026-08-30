import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { AdminModule } from "./modules/admin/admin.module";
import { AuthModule } from "./modules/auth/auth.module";
import { CoursesModule } from "./modules/courses/courses.module";
import { DatabaseModule } from "./modules/database/database.module";
import { GenerationModule } from "./modules/generation/generation.module";
import { HealthController } from "./modules/health/health.controller";
import { PortalModule } from "./modules/portal/portal.module";
import { AuthenticationGuard } from "./modules/auth/authentication.guard";

@Module({
  imports: [DatabaseModule, AuthModule, AdminModule, CoursesModule, GenerationModule, PortalModule],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: AuthenticationGuard }],
})
export class AppModule {}
