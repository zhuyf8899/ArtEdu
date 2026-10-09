import { Controller, Get, Post, Param, Req, Res } from '@nestjs/common';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { AuthService } from '../auth/auth.service';
import { ComfyService } from './comfy.service';
@Controller('comfy')
export class ComfyController {
    constructor(private readonly auth: AuthService, private readonly comfy: ComfyService) { }
    @Get('catalog')
    async catalog(
    @Req()
    r: FastifyRequest) { return this.comfy.catalog(await this.auth.getActor(r)); }
    @Get('queue')
    async queue(
    @Req()
    r: FastifyRequest) { return this.comfy.queue(await this.auth.getActor(r)); }
    @Get('jobs/:runId')
    async job(
    @Req()
    r: FastifyRequest,
    @Param('runId')
    id: string) { return this.comfy.job(await this.auth.getActor(r), id); }
    @Post('jobs/:runId/retry')
    async retry(
    @Req()
    r: FastifyRequest,
    @Param('runId')
    id: string) { return this.comfy.retry(await this.auth.getActor(r), id); }
    @Post('jobs/:runId/cancel')
    async cancel(
    @Req()
    r: FastifyRequest,
    @Param('runId')
    id: string) { return this.comfy.cancel(await this.auth.getActor(r), id); }
    @Get('artifacts/:id')
    async asset(
    @Req()
    r: FastifyRequest,
    @Res({ passthrough: true })
    reply: FastifyReply,
    @Param('id')
    id: string) { const a = await this.comfy.asset(await this.auth.getActor(r), id); reply.header('Content-Type', a.mimeType); reply.header('Cache-Control', 'private, no-store'); reply.header('X-Content-Type-Options', 'nosniff'); return a.stream; }
}
