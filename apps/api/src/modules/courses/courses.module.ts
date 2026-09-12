import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { RagModule } from "../rag/rag.module";
import { AdminCoursesController, CoursesController } from "./courses.controller";
import { CoursesService } from "./courses.service";

@Module({
  imports: [AuthModule, RagModule],
  controllers: [CoursesController, AdminCoursesController],
  providers: [CoursesService],
})
export class CoursesModule {}
