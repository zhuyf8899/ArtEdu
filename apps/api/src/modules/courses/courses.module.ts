import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AdminCoursesController, CoursesController } from "./courses.controller";
import { CoursesService } from "./courses.service";

@Module({
  imports: [AuthModule],
  controllers: [CoursesController, AdminCoursesController],
  providers: [CoursesService],
})
export class CoursesModule {}
