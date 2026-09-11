import { Controller, Delete, Get, Param, Post, Query, Req, Res } from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import { parseInput } from "../../common/validation";
import { AuthService } from "../auth/auth.service";
import { temporaryUploadQuerySchema } from "./creation-storage.contracts";
import { CreationStorageService } from "./creation-storage.service";

@Controller("creation-files")
export class CreationStorageController {
  constructor(private readonly auth: AuthService, private readonly storage: CreationStorageService) {}
  @Get() async list(@Req() request: FastifyRequest) { return this.storage.list(await this.auth.getActor(request)); }
  @Post() async upload(@Req() request: FastifyRequest, @Query() query: unknown) {
    const input = parseInput(temporaryUploadQuerySchema, query);
    return this.storage.upload(await this.auth.getActor(request), request, input.conversationLocalId);
  }
  @Delete(":uploadId") async remove(@Req() request: FastifyRequest, @Param("uploadId") uploadId: string) { return this.storage.remove(await this.auth.getActor(request), uploadId); }
  @Get(":uploadId/download") async download(@Req() request: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply, @Param("uploadId") uploadId: string) {
    const asset = await this.storage.open(await this.auth.getActor(request), uploadId);
    reply.header("Content-Type", asset.mimeType).header("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(asset.fileName)}`).header("X-Content-Type-Options", "nosniff");
    return asset.stream;
  }
}
