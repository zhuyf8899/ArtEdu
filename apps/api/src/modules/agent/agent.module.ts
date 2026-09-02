import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { DatabaseModule } from "../database/database.module";
import { AgentAdminController } from "./agent-admin.controller";
import { AgentController } from "./agent.controller";
import { AgentService } from "./agent.service";
import { AgentHarnessService } from "./agent-harness.service";

@Module({
  imports: [AuthModule, DatabaseModule],
  controllers: [AgentController, AgentAdminController],
  providers: [AgentService, AgentHarnessService],
  exports: [AgentService],
})
export class AgentModule {}
