/**
 * 【后端模块总目录】imports 把各领域模块装进应用；controllers 注册本模块的接口；providers 注册可注入的服务。APP_GUARD 将认证守卫设为全局入口检查，具体业务权限仍由业务层验证。
 */
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
import { KnowledgeModule } from "./modules/knowledge/knowledge.module";
import { LocalBridgeModule } from "./modules/local-bridge/local-bridge.module";
import { PortalModule } from "./modules/portal/portal.module";
import { RagModule } from "./modules/rag/rag.module";
import { StudioModule } from "./modules/studio/studio.module";
import { AuthenticationGuard } from "./modules/auth/authentication.guard";

// @Module 是 NestJS 的模块说明；Nest 根据它自动创建并连接各服务的依赖。
@Module({
  imports: [DatabaseModule, AuthModule, AdminModule, AgentModule, CoursesModule, CreationStorageModule, GenerationModule, LearningModule, KnowledgeModule, LocalBridgeModule, PortalModule, RagModule, StudioModule],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: AuthenticationGuard }],
})
export class AppModule {}
