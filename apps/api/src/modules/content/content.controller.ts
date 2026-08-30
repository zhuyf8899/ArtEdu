import { Body, Controller, Get, Inject, Param, Patch, Post, Query, Req } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { parseInput } from "../../common/validation";
import { AuthService } from "../auth/auth.service";
import {
  commentSchema, courseInputSchema, lessonInputSchema, pageSchema, progressSchema,
  resourceInputSchema, resourcePatchSchema, workflowInputSchema, workflowVersionSchema, workInputSchema, conversationSchema, messageSchema, toolInputSchema, statusSchema,
} from "./content.contracts";
import { ContentService } from "./content.service";

@Controller()
export class ContentController {
  constructor(@Inject(AuthService) private readonly auth: AuthService, @Inject(ContentService) private readonly content: ContentService) {}

  @Get("courses") async listCourses(@Query() query: unknown, @Req() req: FastifyRequest) { await this.actor(req); return this.content.listCourses(parseInput(pageSchema, query)); }
  @Get("courses/:courseId") getCourse(@Param("courseId") id: string, @Req() req: FastifyRequest) { return this.content.getCourse(id, this.auth.getActor(req)); }
  @Post("courses") async createCourse(@Body() body: unknown, @Req() req: FastifyRequest) { return this.content.createCourse(await this.actor(req), parseInput(courseInputSchema, body)); }
  @Patch("courses/:courseId") async updateCourse(@Param("courseId") id: string, @Body() body: unknown, @Req() req: FastifyRequest) { return this.content.updateCourse(await this.actor(req), id, parseInput(courseInputSchema.partial(), body)); }
  @Patch("courses/:courseId/status") async updateCourseStatus(@Param("courseId") id: string, @Body() body: unknown, @Req() req: FastifyRequest) { return this.content.updateStatus(await this.actor(req), "courses", id, parseInput(statusSchema, body).status); }
  @Post("courses/:courseId/lessons") async createLesson(@Param("courseId") id: string, @Body() body: unknown, @Req() req: FastifyRequest) { return this.content.createLesson(await this.actor(req), id, parseInput(lessonInputSchema, body)); }
  @Patch("lessons/:lessonId") async updateLesson(@Param("lessonId") id: string, @Body() body: unknown, @Req() req: FastifyRequest) { return this.content.updateLesson(await this.actor(req), id, parseInput(lessonInputSchema.partial(), body)); }
  @Post("courses/:courseId/resources") async createResource(@Param("courseId") id: string, @Body() body: unknown, @Req() req: FastifyRequest) { return this.content.createResource(await this.actor(req), id, parseInput(resourceInputSchema, body)); }
  @Patch("resources/:resourceId") async updateResource(@Param("resourceId") id: string, @Body() body: unknown, @Req() req: FastifyRequest) { return this.content.updateResource(await this.actor(req), id, parseInput(resourcePatchSchema, body)); }
  @Patch("lessons/:lessonId/progress") async progress(@Param("lessonId") id: string, @Body() body: unknown, @Req() req: FastifyRequest) { return this.content.updateProgress(await this.actor(req), id, parseInput(progressSchema, body)); }

  @Get("workflows") async listWorkflows(@Query() query: unknown, @Req() req: FastifyRequest) { await this.actor(req); return this.content.listWorkflows(parseInput(pageSchema, query)); }
  @Get("workflows/:workflowId") async getWorkflow(@Param("workflowId") id: string, @Req() req: FastifyRequest) { await this.actor(req); return this.content.getWorkflow(id); }
  @Post("workflows") async createWorkflow(@Body() body: unknown, @Req() req: FastifyRequest) { return this.content.createWorkflow(await this.actor(req), parseInput(workflowInputSchema, body)); }
  @Patch("workflows/:workflowId") async updateWorkflow(@Param("workflowId") id: string, @Body() body: unknown, @Req() req: FastifyRequest) { return this.content.updateWorkflow(await this.actor(req), id, parseInput(workflowInputSchema.partial(), body)); }
  @Patch("workflows/:workflowId/status") async updateWorkflowStatus(@Param("workflowId") id: string, @Body() body: unknown, @Req() req: FastifyRequest) { return this.content.updateStatus(await this.actor(req), "workflows", id, parseInput(statusSchema, body).status); }
  @Post("workflows/:workflowId/versions") async createVersion(@Param("workflowId") id: string, @Body() body: unknown, @Req() req: FastifyRequest) { return this.content.createWorkflowVersion(await this.actor(req), id, parseInput(workflowVersionSchema, body)); }

  @Get("works") listWorks(@Query() query: unknown, @Req() req: FastifyRequest) { return this.content.listWorks(parseInput(pageSchema, query), this.auth.getActor(req)); }
  @Get("works/:workId") getWork(@Param("workId") id: string, @Req() req: FastifyRequest) { return this.content.getWork(id, this.auth.getActor(req)); }
  @Post("works") async createWork(@Body() body: unknown, @Req() req: FastifyRequest) {
    // TODO: 接入对象存储后，这里的 storageKey 应由上传接口签发，不能由浏览器直接提交任意路径。
    return this.content.createWork(await this.actor(req), parseInput(workInputSchema, body));
  }
  @Patch("works/:workId") async updateWork(@Param("workId") id: string, @Body() body: unknown, @Req() req: FastifyRequest) { return this.content.updateWork(await this.actor(req), id, parseInput(workInputSchema.partial(), body)); }
  @Patch("works/:workId/status") async updateWorkStatus(@Param("workId") id: string, @Body() body: unknown, @Req() req: FastifyRequest) { return this.content.updateWorkStatus(await this.actor(req), id, parseInput(statusSchema, body).status); }
  @Get("works/:workId/comments") getComments(@Param("workId") id: string, @Req() req: FastifyRequest) { return this.content.listComments(this.auth.getActor(req), id); }
  @Post("works/:workId/comments") async comment(@Param("workId") id: string, @Body() body: unknown, @Req() req: FastifyRequest) { return this.content.addComment(await this.actor(req), id, parseInput(commentSchema, body)); }
  @Post("works/:workId/like") async like(@Param("workId") id: string, @Req() req: FastifyRequest) { return this.content.toggleReaction(await this.actor(req), id, "like"); }
  @Post("works/:workId/favorite") async favorite(@Param("workId") id: string, @Req() req: FastifyRequest) { return this.content.toggleReaction(await this.actor(req), id, "favorite"); }

  @Get("search") async search(@Query() query: unknown, @Req() req: FastifyRequest) { await this.actor(req); return this.content.search(parseInput(pageSchema, query)); }

  @Get("tools") async listTools(@Query() query: unknown, @Req() req: FastifyRequest) { await this.actor(req); return this.content.listTools(parseInput(pageSchema, query)); }
  @Post("tools") async createTool(@Body() body: unknown, @Req() req: FastifyRequest) { return this.content.createTool(await this.actor(req), parseInput(toolInputSchema, body)); }
  @Patch("tools/:toolId") async updateTool(@Param("toolId") id: string, @Body() body: unknown, @Req() req: FastifyRequest) { return this.content.updateTool(await this.actor(req), id, parseInput(toolInputSchema.partial(), body)); }
  @Patch("tools/:toolId/status") async updateToolStatus(@Param("toolId") id: string, @Body() body: unknown, @Req() req: FastifyRequest) { return this.content.updateStatus(await this.actor(req), "tools", id, parseInput(statusSchema, body).status); }
  @Get("conversations") async listConversations(@Req() req: FastifyRequest) { return this.content.listConversations(await this.actor(req)); }
  @Post("conversations") async createConversation(@Body() body: unknown, @Req() req: FastifyRequest) { return this.content.createConversation(await this.actor(req), parseInput(conversationSchema, body)); }
  @Get("conversations/:conversationId") async getConversation(@Param("conversationId") id: string, @Req() req: FastifyRequest) { return this.content.getConversation(await this.actor(req), id); }
  @Post("conversations/:conversationId/messages") async addMessage(@Param("conversationId") id: string, @Body() body: unknown, @Req() req: FastifyRequest) {
    // TODO: 接入模型适配器和流式响应；当前只持久化用户消息并返回 queued_for_model。
    return this.content.addMessage(await this.actor(req), id, parseInput(messageSchema, body));
  }

  private actor(req: FastifyRequest) { return this.auth.getActor(req); }
}
