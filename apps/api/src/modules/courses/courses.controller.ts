import { Body, Controller, Get, Param, Post, Put, Query, Req } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { parseInput } from "../../common/validation";
import { AuthService } from "../auth/auth.service";
import {
  courseReviewDecisionSchema,
  createCourseSchema,
  listCoursesQuerySchema,
  updateCourseSchema,
  updateProgressSchema,
} from "./courses.contracts";
import type {
  CourseReviewDecisionInput,
  CreateCourseInput,
  ProgressInput,
  UpdateCourseInput,
} from "./courses.contracts";
import { CoursesService } from "./courses.service";

@Controller()
export class CoursesController {
  constructor(private readonly courses: CoursesService, private readonly auth: AuthService) {}

  @Get("courses")
  async list(@Req() request: FastifyRequest, @Query() query: unknown) {
    return this.courses.listPublished(await this.auth.getActor(request), parseInput(listCoursesQuerySchema, query));
  }

  @Get("courses/:courseId")
  async detail(@Req() request: FastifyRequest, @Param("courseId") courseId: string) {
    return this.courses.getPublished(await this.auth.getActor(request), courseId);
  }

  @Post("courses/:courseId/enroll")
  async enroll(@Req() request: FastifyRequest, @Param("courseId") courseId: string) {
    return this.courses.enroll(await this.auth.getActor(request), courseId);
  }

  @Put("courses/:courseId/lessons/:lessonId/progress")
  async progress(
    @Req() request: FastifyRequest,
    @Param("courseId") courseId: string,
    @Param("lessonId") lessonId: string,
    @Body() body: unknown,
  ) {
    return this.courses.updateProgress(
      await this.auth.getActor(request), courseId, lessonId,
      parseInput(updateProgressSchema, body) as ProgressInput,
    );
  }

  @Get("me/learning-progress")
  async myLearning(@Req() request: FastifyRequest) {
    return this.courses.getMyLearning(await this.auth.getActor(request));
  }
}

@Controller("admin")
export class AdminCoursesController {
  constructor(private readonly courses: CoursesService, private readonly auth: AuthService) {}

  @Get("courses")
  async list(@Req() request: FastifyRequest) {
    return this.courses.listManaged(await this.auth.getActor(request));
  }

  @Post("courses")
  async create(@Req() request: FastifyRequest, @Body() body: unknown) {
    return this.courses.create(
      await this.auth.getActor(request), parseInput(createCourseSchema, body) as CreateCourseInput,
    );
  }

  @Put("courses/:courseId")
  async update(@Req() request: FastifyRequest, @Param("courseId") courseId: string, @Body() body: unknown) {
    return this.courses.update(
      await this.auth.getActor(request), courseId, parseInput(updateCourseSchema, body) as UpdateCourseInput,
    );
  }

  @Post("courses/:courseId/submit-review")
  async submit(@Req() request: FastifyRequest, @Param("courseId") courseId: string) {
    return this.courses.submitReview(await this.auth.getActor(request), courseId);
  }

  @Get("course-reviews")
  async reviews(@Req() request: FastifyRequest) {
    return this.courses.listReviews(await this.auth.getActor(request));
  }

  @Post("course-reviews/:reviewId/decision")
  async decide(@Req() request: FastifyRequest, @Param("reviewId") reviewId: string, @Body() body: unknown) {
    return this.courses.decideReview(
      await this.auth.getActor(request), reviewId,
      parseInput(courseReviewDecisionSchema, body) as CourseReviewDecisionInput,
    );
  }
}
