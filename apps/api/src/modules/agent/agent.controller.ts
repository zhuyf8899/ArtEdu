import { Body, Controller, Get, Param, Post, Query, Req, Res } from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import { parseInput } from "../../common/validation";
import { AuthService } from "../auth/auth.service";
import { createAgentRunSchema, executeAgentRunSchema, type CreateAgentRunInput, type ExecuteAgentRunInput } from "./agent.contracts";
import { AgentHarnessService } from "./agent-harness.service";
import { AgentService } from "./agent.service";
import { AgentWorkspaceService } from "./agent-workspace.service";
import { previewCspFor } from "./workspace-preview-csp";
import { WorkspacePreviewGrants, workspaceGrantPath } from "./workspace-preview-grants";
import { Public } from "../auth/public.decorator";
import { getEnvironment } from "../../common/environment";

@Controller("agent-runs")
export class AgentController {
  constructor(private readonly agents: AgentService, private readonly harness: AgentHarnessService, private readonly auth: AuthService, private readonly workspace: AgentWorkspaceService, private readonly previewGrants: WorkspacePreviewGrants) {}

  @Get("workspace-file")
  async openWorkspaceFile(@Req() request: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply, @Query("path") filePath: string) {
    return this.openPrivatePreview(request, reply, filePath);
  }

  @Get("workspace-preview/*")
  async previewWorkspaceFile(@Req() request: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    return this.openPrivatePreview(request, reply, String((request.params as Record<string, string>)["*"] ?? ""));
  }

  @Public()
  @Get("workspace-preview-grant/:token/*")
  async openGrantedPreview(@Req() request: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply, @Param("token") token: string) {
    const filePath = String((request.params as Record<string, string>)["*"] ?? "");
    const owner = await this.previewGrants.authorize(token, filePath);
    const asset = await this.workspace.open(owner, filePath, owner.directory);
    if (request.headers.origin === "null") reply.header("Access-Control-Allow-Origin", "null");
    return this.sendPreviewAsset(request, reply, asset, workspaceGrantPath + token + "/");
  }

  private async openPrivatePreview(request: FastifyRequest, reply: FastifyReply, filePath: string) {
    const actor = await this.auth.getActor(request);
    const asset = await this.workspace.open(actor, filePath);
    if (asset.contentType.split(";")[0] === "text/html") {
      asset.stream.destroy();
      const location = await this.previewGrants.issue(actor.id, asset.path);
      reply.header("Cache-Control", "private, no-store").header("Referrer-Policy", "no-referrer").header("Location", location).code(302);
      return;
    }
    return this.sendPreviewAsset(request, reply, asset);
  }

  private sendPreviewAsset(request: FastifyRequest, reply: FastifyReply, asset: Awaited<ReturnType<AgentWorkspaceService["open"]>>, grantPrefix = "") {
    reply.header("Cache-Control", "private, no-store").header("Referrer-Policy", "no-referrer")
      .header("Content-Type", asset.contentType)
      .header("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(asset.fileName)}`)
      .header("X-Content-Type-Options", "nosniff");
    const csp = previewCspFor(asset.contentType, request.headers["x-forwarded-host"] ?? request.headers.host, grantPrefix, getEnvironment().corsOrigins);
    if (csp) reply.header("Content-Security-Policy", csp);
    return asset.stream;
  }

  @Post()
  async create(@Req() request: FastifyRequest, @Body() body: CreateAgentRunInput) {
    const input = parseInput(createAgentRunSchema, body);
    return this.agents.createRun(await this.auth.getActor(request), { ...input, parameters: input.parameters ?? {} });
  }

  @Get("me")
  async listMine(@Req() request: FastifyRequest) {
    return this.agents.listMyRuns(await this.auth.getActor(request));
  }

  @Post(":runId/execute")
  async execute(@Req() request: FastifyRequest, @Param("runId") runId: string, @Body() body: unknown) {
    const input = parseInput(executeAgentRunSchema, body) as ExecuteAgentRunInput;
    return this.harness.execute(await this.auth.getActor(request), runId, input);
  }

  /**
   * 流式执行：以 SSE 把正文增量实时推给前端，结束时把整条 run 放进 done 事件
   * （结构与 /execute 的返回值一致，所以前端的映射逻辑不用区分流式与否）。
   *
   * 与 /execute 共用同一套持久化与审计路径——流式只改变"什么时候把正文交出去"，
   * 落库仍然是流完拿全文写一条，DB 结构零变更。老的 /execute 一字不动。
   */
  @Post(":runId/execute-stream")
  async executeStream(@Req() request: FastifyRequest, @Res() reply: FastifyReply, @Param("runId") runId: string, @Body() body: unknown) {
    const input = parseInput(executeAgentRunSchema, body) as ExecuteAgentRunInput;
    const actor = await this.auth.getActor(request);

    // 直接接管原始响应：Nest 的 JSON 序列化会把整个响应体缓冲起来，SSE 必须逐帧写出。
    const raw = reply.raw;
    raw.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // 反代会缓冲响应，不显式关掉的话增量会被攒成一大块，流式就白做了。
      "X-Accel-Buffering": "no",
    });

    let settled = false;
    const send = (event: string, data: unknown) => {
      if (settled || raw.writableEnded) return;
      raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    const controller = new AbortController();
    // 客户端断开（用户点「暂停输出」或关页面）→ 立即中断上游模型调用，不再继续烧 token。
    request.raw.on("close", () => { if (!settled) controller.abort(); });

    try {
      const run = await this.harness.execute(actor, runId, input, {
        signal: controller.signal,
        onDelta: (text) => send("delta", { text }),
        onTemporaryWorkflow: (workflow) => send("temporary_workflow",{workflow}),
        onProgress: (event) => send("progress", event),
      });
      send("done", { run });
    } catch (error) {
      send("error", { message: error instanceof Error ? error.message : "生成失败" });
    } finally {
      settled = true;
      raw.end();
    }
  }

  @Get(":runId")
  async get(@Req() request: FastifyRequest, @Param("runId") runId: string) {
    return this.agents.getRun(await this.auth.getActor(request), runId);
  }

  @Get(":runId/artifacts/:artifactId/download")
  async downloadArtifact(@Req() request: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply, @Param("runId") runId: string, @Param("artifactId") artifactId: string) {
    const artifact = await this.agents.readArtifact(await this.auth.getActor(request), runId, artifactId);
    reply.header("Content-Type", "application/json; charset=utf-8");
    reply.header("Content-Disposition", `attachment; filename=artedu-${artifactId.slice(-12)}.json`);
    reply.header("Cache-Control", "private, no-store");
    return artifact.data;
  }
}
