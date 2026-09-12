import { Body, Controller, Get, HttpException, HttpStatus, Param, Post, Put, Query, Req, Res } from "@nestjs/common";
import { createReadStream } from "node:fs";
import type { FastifyReply, FastifyRequest } from "fastify";
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

  @Get("courses/:courseId/resources/:resourceId/download")
  async downloadResource(@Req() request: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply, @Param("courseId") courseId: string, @Param("resourceId") resourceId: string) {
    const resource = await this.courses.openResource(await this.auth.getActor(request), courseId, resourceId);
    const encodedName = encodeURIComponent(resource.fileName).replace(/['()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
    reply.header("Content-Type", resource.mimeType);
    reply.header("Cache-Control", "private, no-store");
    reply.header("X-Content-Type-Options", "nosniff");
    if (resource.resourceType !== "video") {
      reply.header("Content-Disposition", `attachment; filename*=UTF-8''${encodedName}`);
      reply.header("Content-Length", String(resource.sizeBytes));
      return createReadStream(resource.filePath);
    }

    reply.header("Content-Disposition", `inline; filename*=UTF-8''${encodedName}`);
    reply.header("Accept-Ranges", "bytes");
    const range = request.headers.range;
    if (!range) {
      reply.header("Content-Length", String(resource.sizeBytes));
      return createReadStream(resource.filePath);
    }
    const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    if (!match) throw new HttpException("不支持该视频范围请求", HttpStatus.REQUESTED_RANGE_NOT_SATISFIABLE);
    const start = match[1] ? Number(match[1]) : Math.max(0, resource.sizeBytes - Number(match[2] || 0));
    const end = match[2] ? Number(match[2]) : resource.sizeBytes - 1;
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || start >= resource.sizeBytes) {
      reply.header("Content-Range", `bytes */${resource.sizeBytes}`);
      throw new HttpException("视频范围无效", HttpStatus.REQUESTED_RANGE_NOT_SATISFIABLE);
    }
    const boundedEnd = Math.min(end, resource.sizeBytes - 1);
    reply.code(HttpStatus.PARTIAL_CONTENT);
    reply.header("Content-Range", `bytes ${start}-${boundedEnd}/${resource.sizeBytes}`);
    reply.header("Content-Length", String(boundedEnd - start + 1));
    return createReadStream(resource.filePath, { start, end: boundedEnd });
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

  @Post("courses/:courseId/resources")
  async uploadResource(@Req() request: FastifyRequest, @Param("courseId") courseId: string) {
    return this.courses.uploadResource(await this.auth.getActor(request), courseId, request);
  }
}
