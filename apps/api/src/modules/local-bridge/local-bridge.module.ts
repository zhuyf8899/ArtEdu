import { Module } from "@nestjs/common";
import { AgentModule } from "../agent/agent.module";
import { AuthModule } from "../auth/auth.module";
import { LocalBridgeController } from "./local-bridge.controller";
import { LocalBridgeService } from "./local-bridge.service";
@Module({ imports: [AgentModule, AuthModule], controllers: [LocalBridgeController], providers: [LocalBridgeService] })
export class LocalBridgeModule {}
