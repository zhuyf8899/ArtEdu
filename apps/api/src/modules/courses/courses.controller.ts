import { Body, Controller, Get, HttpException, HttpStatus, Param, Patch, Post, Put, Query, Req, Res } from "@nestjs/common";
import { createReadStream } from "node:fs";
import type { FastifyReply, FastifyRequest } from "fastify";
import { parseInput } from "../../common/validation";
import { AuthService } from "../auth/auth.service";
import { workspacePreviewCsp } from "../agent/workspace-preview-csp";
import {
  courseReviewDecisionSchema,
  createCourseSchema,
  listCoursesQuerySchema,
  updateCourseSchema,
  updateCourseResourceMetadataSchema,
  updateProgressSchema,
} from "./courses.contracts";
import type {
  CourseReviewDecisionInput,
  CreateCourseInput,
  ProgressInput,
  UpdateCourseInput,
  UpdateCourseResourceMetadataInput,
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

  @Get("courses/:courseId/cover")
  async courseCover(@Req() request: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply, @Param("courseId") courseId: string) {
    const cover = await this.courses.openCover(await this.auth.getActor(request), courseId);
    reply.header("Content-Type", cover.mimeType);
    reply.header("Content-Length", String(cover.sizeBytes));
    reply.header("Cache-Control", "private, no-store");
    reply.header("X-Content-Type-Options", "nosniff");
    return createReadStream(cover.filePath);
  }

  @Get("courses/:courseId/resources/:resourceId/cover")
  async resourceCover(@Req() request: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply, @Param("courseId") courseId: string, @Param("resourceId") resourceId: string) {
    const cover = await this.courses.openCover(await this.auth.getActor(request), courseId, resourceId);
    reply.header("Content-Type", cover.mimeType);
    reply.header("Content-Length", String(cover.sizeBytes));
    reply.header("Cache-Control", "private, no-store");
    reply.header("X-Content-Type-Options", "nosniff");
    return createReadStream(cover.filePath);
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

  @Get("me/recent-resources")
  async recentResources(@Req() request: FastifyRequest) {
    return this.courses.getRecentResources(await this.auth.getActor(request));
  }

  @Get("courses/:courseId/resources/:resourceId/download")
  async downloadResource(@Req() request: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply, @Param("courseId") courseId: string, @Param("resourceId") resourceId: string) {
    const resource = await this.courses.openResource(await this.auth.getActor(request), courseId, resourceId, "download");
    return this.sendResource(request, reply, resource, true);
  }

  /**
   * 课件预览：已加入课程的学生即可查看。
   * PDF/图片/网页/视频在浏览器内呈现，Office 原件（PPT/Word）浏览器无法内嵌渲染，
   * 因此按附件下发，由学生本地打开——这条链路同样计入访问审计。
   */
  @Get("courses/:courseId/resources/:resourceId/preview")
  async previewResource(@Req() request: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply, @Param("courseId") courseId: string, @Param("resourceId") resourceId: string) {
    const resource = await this.courses.openResource(await this.auth.getActor(request), courseId, resourceId, "preview");
    const officeOriginal = ["ppt", "word"].includes(resource.resourceType);
    return this.sendResource(request, reply, resource, officeOriginal);
  }

  private sendResource(request: FastifyRequest, reply: FastifyReply, resource: Awaited<ReturnType<CoursesService["openResource"]>>, asAttachment: boolean) {
    const mimeType = resource.mimeType ?? "application/octet-stream";
    const encodedName = encodeURIComponent(resource.fileName).replace(/['()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
    reply.header("Content-Type", mimeType);
    reply.header("Cache-Control", "private, no-store");
    reply.header("X-Content-Type-Options", "nosniff");
    if (asAttachment) {
      reply.header("Content-Disposition", `attachment; filename*=UTF-8''${encodedName}`);
      reply.header("Content-Length", String(resource.sizeBytes));
      return createReadStream(resource.filePath);
    }

    reply.header("Content-Disposition", `inline; filename*=UTF-8''${encodedName}`);
    // 课件要能嵌在课程页的预览框里：必须显式声明 frame-ancestors，浏览器才会忽略
    // 全局钩子补的 X-Frame-Options: DENY（CSP 的 frame-ancestors 优先级更高）。
    // 网页与 SVG 课件是不可信内容，改用与 Agent 预览相同的沙箱策略：
    // 拿不到本站登录态，也不能联网、提交表单或跳转顶层窗口。
    reply.header("Content-Security-Policy", ["text/html", "image/svg+xml"].includes(mimeType)
      ? workspacePreviewCsp(request.headers["x-forwarded-host"] ?? request.headers.host)
      : "frame-ancestors 'self'");
    if (resource.resourceType !== "video") {
      reply.header("Content-Length", String(resource.sizeBytes));
      return createReadStream(resource.filePath);
    }
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

  @Get("courses/:courseId")
  async managedDetail(@Req() request: FastifyRequest, @Param("courseId") courseId: string) {
    return this.courses.getManagedDetail(await this.auth.getActor(request), courseId);
  }

  @Patch("courses/:courseId/resources/:resourceId")
  async updateResource(@Req() request: FastifyRequest, @Param("courseId") courseId: string, @Param("resourceId") resourceId: string, @Body() body: unknown) {
    return this.courses.updateResourceMetadata(await this.auth.getActor(request), courseId, resourceId,
      parseInput(updateCourseResourceMetadataSchema, body) as UpdateCourseResourceMetadataInput);
  }

  @Post("courses/:courseId/cover")
  async uploadCourseCover(@Req() request: FastifyRequest, @Param("courseId") courseId: string) {
    return this.courses.uploadCover(await this.auth.getActor(request), courseId, request);
  }

  @Post("courses/:courseId/resources/:resourceId/cover")
  async uploadResourceCover(@Req() request: FastifyRequest, @Param("courseId") courseId: string, @Param("resourceId") resourceId: string) {
    return this.courses.uploadCover(await this.auth.getActor(request), courseId, request, resourceId);
  }
}
