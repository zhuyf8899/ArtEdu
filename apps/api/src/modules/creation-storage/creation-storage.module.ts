import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { DatabaseModule } from "../database/database.module";
import { CreationStorageController } from "./creation-storage.controller";
import { CreationStorageService } from "./creation-storage.service";
@Module({ imports: [AuthModule, DatabaseModule], controllers: [CreationStorageController], providers: [CreationStorageService] })
export class CreationStorageModule {}
