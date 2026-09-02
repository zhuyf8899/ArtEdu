import { ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { PoolClient, QueryResultRow } from "pg";
import { getEnvironment } from "../../common/environment";
import type { Actor } from "../auth/auth.service";
import { DatabaseService } from "../database/database.service";
import type { CreateAgentRunInput } from "./agent.contracts";
import { scanText } from "./agent.scanner";

type RunStatus = "queued" | "running" | "waiting_user" | "succeeded" | "failed" | "blocked" | "cancelled";

interface RunRow extends QueryResultRow {
  id: string; user_id: string; scenario: string; status: RunStatus; input_json: Record<string, unknown>;
  failure_reason: string | null; created_at: Date; updated_at: Date; completed_at: Date | null;
}

@Injectable()
export class AgentService {
  constructor(private readonly database: DatabaseService) {}

  async createRun(actor: Actor, input: CreateAgentRunInput) {
    const runId = `agent-run-${randomUUID()}`;
    await this.database.transaction(async (client) => {
      await client.query(`INSERT INTO agent_runs (id,user_id,scenario,status,input_json) VALUES ($1,$2,$3,'queued',$4::jsonb)`, [runId, actor.id, input.scenario, JSON.stringify({ prompt: input.prompt, parameters: input.parameters })]);
      await this.recordMessage(client, runId, actor.id, "user", input.prompt, "input", runId);
    });
    return this.getRun(actor, runId);
  }

  async getRun(actor: Actor, runId: string) {
    return this.getRunForActor(actor, runId);
  }

  async listMyRuns(actor: Actor) {
    const rows = await this.database.query<RunRow>(`SELECT * FROM agent_runs WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50`, [actor.id]);
    return { items: rows.rows.map((row) => this.mapRun(row)) };
  }

  async listOpenAlerts(actor: Actor) {
    if (!actor.roles.includes("admin")) throw new ForbiddenException("仅管理员可查看安全告警");
    const result = await this.database.query(`SELECT id,run_id,user_id,severity,status,summary,target_type,target_id,created_at FROM agent_security_alerts WHERE status='open' ORDER BY created_at DESC LIMIT 100`);
    return { items: result.rows.map((row) => ({ id: row.id, runId: row.run_id, userId: row.user_id, severity: row.severity, status: row.status, summary: row.summary, targetType: row.target_type, targetId: row.target_id, createdAt: row.created_at.toISOString() })) };
  }

  // 供未来 Agent Runtime 调用；不暴露为浏览器写接口，避免用户伪造 Agent 输出。
  async appendAgentMessage(runId: string, content: string) {
    return this.database.transaction(async (client) => {
      const result = await client.query<{ user_id: string }>("SELECT user_id FROM agent_runs WHERE id=$1", [runId]);
      if (!result.rows[0]) throw new NotFoundException("Agent Run 不存在");
      await this.recordMessage(client, runId, result.rows[0].user_id, "agent", content, "message", `agent-message-${randomUUID()}`);
    });
    return this.getRunInternal(runId);
  }

  async claimForExecution(actor: Actor, runId: string) {
    const run = await this.getOwnedRun(runId);
    if (run.user_id !== actor.id && !actor.roles.includes("admin")) throw new ForbiddenException("无权执行该 Agent Run");
    const result = await this.database.query<RunRow>(`UPDATE agent_runs SET status='running',updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND status='queued' RETURNING *`, [runId]);
    if (!result.rows[0]) throw new ConflictException("该 Agent Run 已被执行或不能再次执行");
    return this.mapRun(result.rows[0]);
  }

  async appendToolCall(runId: string, toolName: string, input: Record<string, unknown>, output: Record<string, unknown>) {
    const run = await this.getOwnedRun(runId);
    const toolCallId = `agent-tool-${randomUUID()}`;
    await this.database.transaction(async (client) => {
      const scanStatus = await this.scanTarget(client, runId, run.user_id, "tool_call", toolCallId, JSON.stringify({ input, output }));
      await client.query(`INSERT INTO agent_tool_calls (id,run_id,tool_name,status,input_json,output_json,started_at,completed_at) VALUES ($1,$2,$3,'succeeded',$4::jsonb,$5::jsonb,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`, [toolCallId, runId, toolName, JSON.stringify(input), JSON.stringify({ ...output, scanStatus })]);
    });
    return toolCallId;
  }

  async appendArtifact(runId: string, type: "brief" | "prompt" | "webpage" | "image" | "pattern" | "document" | "preview", metadata: Record<string, unknown>, location: { storageKey?: string; externalUrl?: string } = {}) {
    const run = await this.getOwnedRun(runId);
    const artifactId = `agent-artifact-${randomUUID()}`;
    await this.database.transaction(async (client) => {
      const scanStatus = await this.scanTarget(client, runId, run.user_id, "artifact", artifactId, JSON.stringify(metadata));
      await client.query(`INSERT INTO agent_artifacts (id,run_id,artifact_type,storage_key,external_url,metadata_json,scan_status) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7)`, [artifactId, runId, type, location.storageKey ?? (location.externalUrl ? null : `agent-runs/${runId}/${artifactId}.json`), location.externalUrl ?? null, JSON.stringify(metadata), scanStatus]);
    });
    return artifactId;
  }

  async completeRun(runId: string) {
    await this.database.query(`UPDATE agent_runs SET status='succeeded',updated_at=CURRENT_TIMESTAMP,completed_at=CURRENT_TIMESTAMP WHERE id=$1 AND status='running'`, [runId]);
    return this.getRunInternal(runId);
  }

  async waitForLocalBridge(runId: string) {
    await this.database.query(`UPDATE agent_runs SET status='waiting_user',updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND status='running'`, [runId]);
    return this.getRunInternal(runId);
  }

  async claimNextForLocalBridge(userId: string) {
    const result = await this.database.query<RunRow>(`
      WITH next_run AS (
        SELECT id FROM agent_runs WHERE user_id=$1 AND status='waiting_user'
        ORDER BY updated_at ASC FOR UPDATE SKIP LOCKED LIMIT 1
      )
      UPDATE agent_runs run SET status='running',updated_at=CURRENT_TIMESTAMP
      FROM next_run WHERE run.id=next_run.id RETURNING run.*
    `, [userId]);
    return result.rows[0] ? this.mapRun(result.rows[0]) : null;
  }

  async completeFromLocalBridge(userId: string, runId: string, content: string, providerId: string, model: string) {
    const run = await this.getOwnedRun(runId);
    if (run.user_id !== userId || run.status !== "running") throw new ForbiddenException("本地 Bridge 无权回传该任务");
    await this.appendToolCall(runId, "local_bridge.model_result", { providerId, model, secretTransferred: false }, { content, providerId, model });
    const type = run.scenario === "webpage_generation" ? "webpage" : run.scenario === "pattern_generation" ? "pattern" : "brief";
    await this.appendArtifact(runId, type, { content, providerId, model, generatedBy: "local-bridge" });
    await this.appendAgentMessage(runId, content);
    return this.completeRun(runId);
  }

  async failFromLocalBridge(userId: string, runId: string, reason: string) {
    const run = await this.getOwnedRun(runId);
    if (run.user_id !== userId || run.status !== "running") throw new ForbiddenException("本地 Bridge 无权回传该任务");
    await this.appendToolCall(runId, "local_bridge.model_result", {}, { failed: true, reason });
    await this.appendAgentMessage(runId, `本地模型调用未完成：${reason}`);
    return this.failRun(runId, reason);
  }

  async failRun(runId: string, reason: string) {
    await this.database.query(`UPDATE agent_runs SET status='failed',failure_reason=$2,updated_at=CURRENT_TIMESTAMP,completed_at=CURRENT_TIMESTAMP WHERE id=$1 AND status='running'`, [runId, reason.slice(0, 1000)]);
    return this.getRunInternal(runId);
  }

  private async recordMessage(client: PoolClient, runId: string, userId: string, role: "user" | "agent", content: string, targetType: "input" | "message", targetId: string) {
    const messageId = targetType === "message" ? targetId : `agent-message-${randomUUID()}`;
    const environment = getEnvironment();
    const matches = scanText(content, environment.agentAlertKeywords, environment.agentBlockedKeywords);
    const scanStatus = matches.some((match) => match.severity === "high") ? "blocked" : matches.length ? "warning" : "safe";
    await client.query(`INSERT INTO agent_run_messages (id,run_id,role,content,scan_status) VALUES ($1,$2,$3,$4,$5)`, [messageId, runId, role, content, scanStatus]);
    await this.persistScanMatches(client, runId, userId, targetType, targetType === "input" ? targetId : messageId, matches);
  }

  private async scanTarget(client: PoolClient, runId: string, userId: string, targetType: "tool_call" | "artifact", targetId: string, content: string) {
    const environment = getEnvironment();
    const matches = scanText(content, environment.agentAlertKeywords, environment.agentBlockedKeywords);
    const scanStatus = matches.some((match) => match.severity === "high") ? "blocked" : matches.length ? "warning" : "safe";
    await this.persistScanMatches(client, runId, userId, targetType, targetId, matches);
    return scanStatus;
  }

  private async persistScanMatches(client: PoolClient, runId: string, userId: string, targetType: "input" | "message" | "tool_call" | "artifact", targetId: string, matches: ReturnType<typeof scanText>) {
    for (const match of matches) {
      await client.query(`INSERT INTO agent_content_scans (id,run_id,target_type,target_id,severity,rule_type,matched_rule,redacted_excerpt) VALUES ($1,$2,$3,$4,$5,'keyword',$6,$7)`, [
        `agent-scan-${randomUUID()}`, runId, targetType, targetId, match.severity, match.keyword, match.excerpt,
      ]);
      await client.query(`INSERT INTO agent_security_alerts (id,run_id,user_id,severity,summary,target_type,target_id) VALUES ($1,$2,$3,$4,$5,$6,$7)`, [
        `agent-alert-${randomUUID()}`, runId, userId, match.severity, `Agent Run 命中关键词规则：${match.keyword}`, targetType, targetId,
      ]);
    }
    if (matches.some((match) => match.severity === "high")) await client.query("UPDATE agent_runs SET status='blocked', failure_reason='内容安全规则拦截', updated_at=CURRENT_TIMESTAMP, completed_at=CURRENT_TIMESTAMP WHERE id=$1", [runId]);
  }

  private async getRunForActor(actor: Actor, runId: string) {
    const run = await this.getOwnedRun(runId);
    if (run.user_id !== actor.id && !actor.roles.includes("admin")) throw new ForbiddenException("无权查看该 Agent Run");
    return this.getRunInternal(runId);
  }

  private async getOwnedRun(runId: string) {
    const result = await this.database.query<RunRow>("SELECT * FROM agent_runs WHERE id=$1", [runId]);
    if (!result.rows[0]) throw new NotFoundException("Agent Run 不存在");
    return result.rows[0];
  }

  private async getRunInternal(runId: string) {
    const [run, messages, toolCalls, artifacts, scans, alerts] = await Promise.all([
      this.getOwnedRun(runId),
      this.database.query("SELECT id,role,content,scan_status,created_at FROM agent_run_messages WHERE run_id=$1 ORDER BY created_at", [runId]),
      this.database.query("SELECT id,tool_name,status,input_json,output_json,error_message,started_at,completed_at FROM agent_tool_calls WHERE run_id=$1 ORDER BY started_at", [runId]),
      this.database.query("SELECT id,artifact_type,storage_key,external_url,metadata_json,scan_status,created_at FROM agent_artifacts WHERE run_id=$1 ORDER BY created_at", [runId]),
      this.database.query("SELECT id,target_type,target_id,severity,matched_rule,redacted_excerpt,created_at FROM agent_content_scans WHERE run_id=$1 ORDER BY created_at", [runId]),
      this.database.query("SELECT id,severity,status,summary,target_type,target_id,created_at FROM agent_security_alerts WHERE run_id=$1 ORDER BY created_at", [runId]),
    ]);
    return {
      ...this.mapRun(run),
      messages: messages.rows.map((row) => ({ id: row.id, role: row.role, content: row.content, scanStatus: row.scan_status, createdAt: row.created_at.toISOString() })),
      toolCalls: toolCalls.rows.map((row) => ({ id: row.id, toolName: row.tool_name, status: row.status, input: row.input_json, output: row.output_json, errorMessage: row.error_message, startedAt: row.started_at.toISOString(), completedAt: row.completed_at?.toISOString() ?? null })),
      artifacts: artifacts.rows.map((row) => ({ id: row.id, type: row.artifact_type, storageKey: row.storage_key, externalUrl: row.external_url, metadata: row.metadata_json, scanStatus: row.scan_status, createdAt: row.created_at.toISOString() })),
      scanResults: scans.rows.map((row) => ({ id: row.id, targetType: row.target_type, targetId: row.target_id, severity: row.severity, matchedRule: row.matched_rule, excerpt: row.redacted_excerpt, createdAt: row.created_at.toISOString() })),
      alerts: alerts.rows.map((row) => ({ id: row.id, severity: row.severity, status: row.status, summary: row.summary, targetType: row.target_type, targetId: row.target_id, createdAt: row.created_at.toISOString() })),
    };
  }

  private mapRun(row: RunRow) {
    return { id: row.id, userId: row.user_id, scenario: row.scenario, status: row.status, input: row.input_json, failureReason: row.failure_reason, createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString(), completedAt: row.completed_at?.toISOString() ?? null };
  }
}
