import { Body, Controller, Get, Param, Post, Req } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { parseInput } from "../../common/validation";
import { AuthService } from "../auth/auth.service";
import { ragQuerySchema, type RagQueryInput } from "./rag.contracts";
import { RagService } from "./rag.service";

@Controller()
export class RagController {
  constructor(private readonly rag: RagService, private readonly auth: AuthService) {}

  @Post("courses/:courseId/rag/search")
  async search(@Req() request: FastifyRequest, @Param("courseId") courseId: string, @Body() body: unknown) {
    return this.rag.query(await this.auth.getActor(request), courseId, parseInput(ragQuerySchema, body) as RagQueryInput);
  }

  @Post("admin/courses/:courseId/resources/:resourceId/rag/reindex")
  async reindex(@Req() request: FastifyRequest, @Param("courseId") courseId: string, @Param("resourceId") resourceId: string) {
    return this.rag.reindex(await this.auth.getActor(request), courseId, resourceId);
  }

  @Get("admin/courses/:courseId/resources/:resourceId/rag/status")
  async status(@Req() request: FastifyRequest, @Param("courseId") courseId: string, @Param("resourceId") resourceId: string) {
    return this.rag.getResourceStatus(await this.auth.getActor(request), courseId, resourceId);
  }
}
