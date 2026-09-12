import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { DatabaseModule } from "../database/database.module";
import { GenerationModule } from "../generation/generation.module";
import { PortalModule } from "../portal/portal.module";
import { AgentAdminController } from "./agent-admin.controller";
import { AgentController } from "./agent.controller";
import { AgentService } from "./agent.service";
import { AgentHarnessService } from "./agent-harness.service";
import { WebSearchService } from "./web-search.service";

@Module({
  imports: [AuthModule, DatabaseModule, GenerationModule, PortalModule],
  controllers: [AgentController, AgentAdminController],
  providers: [AgentService, AgentHarnessService, WebSearchService],
  exports: [AgentService, WebSearchService],
})
export class AgentModule {}
