import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import path from "node:path";
import type { FastifyRequest } from "fastify";
import type { PoolClient } from "pg";
import type { Actor } from "../auth/auth.service";
import { AuthService } from "../auth/auth.service";
import { DatabaseService } from "../database/database.service";
import { getEnvironment } from "../../common/environment";
import { storePrivateUpload } from "./private-upload";
import type {
  CatalogQuery,
  WorkflowInput,
  WorkflowRunInput,
  WorkflowRunProgressInput,
  WorkflowVersionInput,
  WorkInput,
} from "./studio.contracts";

interface WorkRow {
  id: string;
  title: string;
  summary: string | null;
  discipline: string | null;
  status: string;
  author_id: string;
  author: string;
  published_at: Date | null;
  created_at: Date;
  like_count: number;
  favorite_count: number;
  liked: boolean;
  favorited: boolean;
  preview_url: string | null;
}

const WORKFLOW_PUBLISH_ROLES = ["admin", "teacher", "operator"];

@Injectable()
export class StudioService {
  constructor(private readonly database: DatabaseService, private readonly auth: AuthService) {}

  async listWorkflows(query: CatalogQuery) {
    const values: unknown[] = [];
    const where = ["w.status = 'published'"];
    if (query.query) {
      values.push(`%${query.query}%`);
      where.push(`(w.name ILIKE $${values.length} OR w.description ILIKE $${values.length})`);
    }
    if (query.category) {
      values.push(query.category);
      where.push(`w.category = $${values.length}`);
    }
    values.push(query.pageSize, (query.page - 1) * query.pageSize);
    const result = await this.database.query(`
      SELECT w.id, w.name, w.description, w.category, w.entry_type, w.entry_url,
        latest.id AS version_id, latest.version_number, latest.definition_json,
        COALESCE(jsonb_array_length(latest.definition_json->'nodes'), jsonb_array_length(latest.definition_json->'steps'), 0)::int AS step_count
      FROM workflows w
      LEFT JOIN LATERAL (
        SELECT id, version_number, definition_json FROM workflow_versions
        WHERE workflow_id = w.id AND published_at IS NOT NULL
        ORDER BY version_number DESC LIMIT 1
      ) latest ON TRUE
      WHERE ${where.join(" AND ")}
      ORDER BY w.is_featured DESC, w.featured_rank NULLS LAST, w.updated_at DESC
      LIMIT $${values.length - 1} OFFSET $${values.length}
    `, values);
    return { items: result.rows.map((row) => this.mapWorkflow(row)), page: query.page, pageSize: query.pageSize };
  }

  async getWorkflow(workflowId: string) {
    const result = await this.database.query(`
      SELECT w.id, w.name, w.description, w.category, w.entry_type, w.entry_url,
        latest.id AS version_id, latest.version_number, latest.definition_json, latest.prompt_template,
        COALESCE(jsonb_array_length(latest.definition_json->'nodes'), jsonb_array_length(latest.definition_json->'steps'), 0)::int AS step_count
      FROM workflows w
      LEFT JOIN LATERAL (
        SELECT * FROM workflow_versions WHERE workflow_id = w.id AND published_at IS NOT NULL
        ORDER BY version_number DESC LIMIT 1
      ) latest ON TRUE
      WHERE w.id = $1 AND w.status = 'published'
    `, [workflowId]);
    if (!result.rows[0]) throw new NotFoundException("工作流不存在或尚未发布");
    return this.mapWorkflow(result.rows[0]);
  }

  async createWorkflow(actor: Actor, input: WorkflowInput) {
    const id = `workflow-${randomUUID()}`;
    await this.database.query(`
      INSERT INTO workflows (id, name, description, category, entry_type, entry_url, status, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,'draft',$7)
    `, [id, input.name, input.description, input.category, input.entryType, input.entryUrl ?? null, actor.id]);
    return { id, ...input, status: "draft" };
  }

  async listManagedWorkflows(actor: Actor, query: CatalogQuery) {
    const values: unknown[] = [];
    const where = ["1=1"];
    if (!actor.roles.includes("admin")) {
      values.push(actor.id);
      where.push(`w.created_by = $${values.length}`);
    }
    if (query.query) {
      values.push(`%${query.query}%`);
      where.push(`(w.name ILIKE $${values.length} OR COALESCE(w.description, '') ILIKE $${values.length})`);
    }
    values.push(query.pageSize, (query.page - 1) * query.pageSize);
    const result = await this.database.query(`
      SELECT w.id,w.name,w.description,w.category,w.entry_type,w.entry_url,w.status,w.created_by,
        w.created_at,w.updated_at,creator.display_name AS creator_name,
        latest.id AS version_id,latest.version_number,latest.definition_json,latest.prompt_template,
        latest.published_at,
        COALESCE(jsonb_array_length(latest.definition_json->'nodes'), jsonb_array_length(latest.definition_json->'steps'), 0)::int AS step_count
      FROM workflows w
      LEFT JOIN users creator ON creator.id = w.created_by
      LEFT JOIN LATERAL (
        SELECT * FROM workflow_versions WHERE workflow_id = w.id
        ORDER BY version_number DESC LIMIT 1
      ) latest ON TRUE
      WHERE ${where.join(" AND ")}
      ORDER BY w.updated_at DESC
      LIMIT $${values.length - 1} OFFSET $${values.length}
    `, values);
    return { items: result.rows.map((row) => this.mapManagedWorkflow(row)), page: query.page, pageSize: query.pageSize };
  }

  async getManagedWorkflow(actor: Actor, workflowId: string) {
    const workflow = await this.database.query(`
      SELECT w.*, creator.display_name AS creator_name
      FROM workflows w LEFT JOIN users creator ON creator.id = w.created_by
      WHERE w.id = $1
    `, [workflowId]);
    if (!workflow.rows[0]) throw new NotFoundException("工作流不存在");
    this.requireWorkflowAccess(actor, workflow.rows[0].created_by);
    const versions = await this.database.query(`
      SELECT id,version_number,definition_json,prompt_template,published_at,created_at
      FROM workflow_versions WHERE workflow_id = $1 ORDER BY version_number DESC
    `, [workflowId]);
    return { ...this.mapManagedWorkflow(workflow.rows[0]), versions: versions.rows.map((version) => {
      const definition = this.normalizeWorkflowDefinition(version.definition_json);
      return {
        id: version.id,
        versionNumber: version.version_number,
        definition,
        nodes: definition.nodes,
        edges: definition.edges,
        steps: this.definitionToSteps(definition),
        promptTemplate: version.prompt_template ?? "",
        published: Boolean(version.published_at),
        createdAt: version.created_at,
      };
    }) };
  }

  async updateWorkflow(actor: Actor, workflowId: string, input: Partial<WorkflowInput>) {
    const current = await this.database.query<{ created_by: string; status: string }>("SELECT created_by,status FROM workflows WHERE id=$1", [workflowId]);
    if (!current.rows[0]) throw new NotFoundException("工作流不存在");
    this.requireWorkflowAccess(actor, current.rows[0].created_by);
    if (current.rows[0].status === "archived") throw new ConflictException("已归档工作流不能编辑");
    const fields = Object.entries(input).filter(([, value]) => value !== undefined);
    if (!fields.length) return this.getManagedWorkflow(actor, workflowId);
    const values = fields.map(([, value]) => value === "" ? null : value);
    const assignments = fields.map(([key], index) => `${this.workflowColumn(key)}=$${index + 2}`);
    await this.database.query(`UPDATE workflows SET ${assignments.join(",")},updated_at=CURRENT_TIMESTAMP WHERE id=$1`, [workflowId, ...values]);
    return this.getManagedWorkflow(actor, workflowId);
  }

  async createWorkflowVersion(actor: Actor, workflowId: string, input: WorkflowVersionInput) {
    const workflow = await this.database.query<{ created_by: string }>("SELECT created_by FROM workflows WHERE id = $1", [workflowId]);
    if (!workflow.rows[0]) throw new NotFoundException("工作流不存在");
    if (!actor.roles.includes("admin") && workflow.rows[0].created_by !== actor.id) throw new ForbiddenException("只能编辑自己创建的工作流");
    if (input.publish) this.auth.requireAnyRole(actor, WORKFLOW_PUBLISH_ROLES);
    const definition = input.definition ?? this.legacyStepsToDefinition(input.steps ?? []);
    const version = await this.database.transaction(async (client) => {
      const next = await client.query<{ number: number }>("SELECT COALESCE(MAX(version_number), 0)::int + 1 AS number FROM workflow_versions WHERE workflow_id = $1", [workflowId]);
      const id = `workflow-version-${randomUUID()}`;
      await client.query(`
        INSERT INTO workflow_versions (id, workflow_id, version_number, definition_json, prompt_template, published_at, created_by)
        VALUES ($1,$2,$3,$4::jsonb,$5,CASE WHEN $6 THEN CURRENT_TIMESTAMP ELSE NULL END,$7)
      `, [id, workflowId, next.rows[0].number, JSON.stringify(definition), input.promptTemplate ?? null, input.publish, actor.id]);
      if (input.publish) await client.query("UPDATE workflows SET status = 'published', updated_at = CURRENT_TIMESTAMP WHERE id = $1", [workflowId]);
      return { id, versionNumber: next.rows[0].number, published: input.publish };
    });
    return { ...version, definition, nodes: definition.nodes, edges: definition.edges, steps: this.definitionToSteps(definition) };
  }

  async startWorkflow(actor: Actor, workflowId: string, input: WorkflowRunInput) {
    const workflow = await this.getWorkflow(workflowId) as Record<string, any>;
    if (!workflow.versionId) throw new ConflictException("工作流还没有已发布版本");
    const id = `workflow-run-${randomUUID()}`;
    await this.database.transaction(async (client) => {
      await client.query(`
        INSERT INTO workflow_runs (id,user_id,workflow_id,workflow_version_id,total_steps,context_json)
        VALUES ($1,$2,$3,$4,$5,$6::jsonb)
      `, [id, actor.id, workflowId, workflow.versionId, workflow.stepCount, JSON.stringify(input.context)]);
      await client.query("INSERT INTO workflow_run_events (id,run_id,step_index,event_type) VALUES ($1,$2,0,'start')", [`workflow-event-${randomUUID()}`, id]);
    });
    return this.getRun(actor, id);
  }

  async listMyRuns(actor: Actor) {
    const result = await this.database.query(`
      SELECT r.*, w.name AS workflow_name, w.category
      FROM workflow_runs r JOIN workflows w ON w.id = r.workflow_id
      WHERE r.user_id = $1 ORDER BY r.updated_at DESC
    `, [actor.id]);
    // Pass the mapper through an arrow function so it keeps the service
    // instance required by normalizeWorkflowDefinition().
    return { items: result.rows.map((row) => this.mapRun(row)) };
  }

  async updateRun(actor: Actor, runId: string, input: WorkflowRunProgressInput) {
    const current = await this.getRun(actor, runId) as Record<string, any>;
    if (current.status !== "in_progress") throw new ConflictException("该工作流执行已结束");
    if (input.stepIndex !== current.currentStep) throw new ConflictException("只能处理当前步骤");
    const advances = input.action === "complete" || input.action === "skip";
    const nextStep = advances ? Math.min(current.currentStep + 1, current.totalSteps) : current.currentStep;
    const completed = nextStep >= current.totalSteps && advances;
    await this.database.transaction(async (client) => {
      await client.query(`
        INSERT INTO workflow_run_events (id,run_id,step_index,event_type,note) VALUES ($1,$2,$3,$4,$5)
      `, [`workflow-event-${randomUUID()}`, runId, input.stepIndex, input.action, input.note ?? null]);
      await client.query(`
        UPDATE workflow_runs SET current_step=$2,status=$3,
          completed_at=CASE WHEN $3='completed' THEN CURRENT_TIMESTAMP ELSE NULL END,updated_at=CURRENT_TIMESTAMP
        WHERE id=$1 AND user_id=$4
      `, [runId, nextStep, completed ? "completed" : "in_progress", actor.id]);
    });
    return this.getRun(actor, runId);
  }

  async listWorks(actor: Actor, query: CatalogQuery) {
    const values: unknown[] = [actor.id];
    const where = ["w.status = 'approved'"];
    if (query.query) {
      values.push(`%${query.query}%`);
      where.push(`(w.title ILIKE $${values.length} OR w.summary ILIKE $${values.length})`);
    }
    if (query.discipline) {
      values.push(query.discipline);
      where.push(`w.discipline = $${values.length}`);
    }
    values.push(query.pageSize, (query.page - 1) * query.pageSize);
    const result = await this.database.query<WorkRow>(`${this.workSelect("$1")}
      WHERE ${where.join(" AND ")}
      GROUP BY w.id, author.display_name
      ORDER BY w.is_featured DESC, w.featured_rank NULLS LAST, w.published_at DESC
      LIMIT $${values.length - 1} OFFSET $${values.length}
    `, values);
    return { items: result.rows.map(this.mapWork), page: query.page, pageSize: query.pageSize };
  }

  async listMyWorks(actor: Actor) {
    const result = await this.database.query<WorkRow>(`${this.workSelect("$2")}
      WHERE w.author_id = $1 GROUP BY w.id, author.display_name ORDER BY w.updated_at DESC
    `, [actor.id, actor.id]);
    return { items: result.rows.map(this.mapWork) };
  }

  async getWork(actor: Actor, workId: string) {
    const result = await this.database.query<WorkRow>(`${this.workSelect("$4")}
      WHERE w.id = $1 AND (w.status = 'approved' OR w.author_id = $2 OR $3::boolean)
      GROUP BY w.id, author.display_name
    `, [workId, actor.id, this.canReview(actor), actor.id]);
    if (!result.rows[0]) throw new NotFoundException("作品不存在");
    const [assets, tags, workflows, comments] = await Promise.all([
      this.database.query("SELECT id,file_name,mime_type,asset_type,external_url,alt_text,sort_order FROM work_assets WHERE work_id=$1 ORDER BY sort_order,created_at", [workId]),
      this.database.query("SELECT t.name,t.slug FROM tags t JOIN work_tags wt ON wt.tag_id=t.id WHERE wt.work_id=$1 ORDER BY t.name", [workId]),
      this.database.query("SELECT wf.id,wf.name,wf.category FROM workflows wf JOIN work_workflows ww ON ww.workflow_id=wf.id WHERE ww.work_id=$1", [workId]),
      this.database.query("SELECT c.id,c.content,c.created_at,u.display_name AS author FROM comments c JOIN users u ON u.id=c.author_id WHERE c.work_id=$1 AND c.status='published' ORDER BY c.created_at", [workId]),
    ]);
    return { ...this.mapWork(result.rows[0]), assets: assets.rows, tags: tags.rows, workflows: workflows.rows, comments: comments.rows };
  }

  async createWork(actor: Actor, input: WorkInput) {
    const id = `work-${randomUUID()}`;
    await this.database.transaction(async (client) => {
      await client.query("INSERT INTO works (id,author_id,title,summary,discipline,status) VALUES ($1,$2,$3,$4,$5,'draft')", [id, actor.id, input.title, input.summary, input.discipline]);
      await this.replaceWorkRelations(client, id, input);
    });
    return this.getWork(actor, id);
  }

  async submitWork(actor: Actor, workId: string) {
    const result = await this.database.transaction(async (client) => {
      const work = await client.query<{ status: string; author_id: string }>("SELECT status,author_id FROM works WHERE id=$1 FOR UPDATE", [workId]);
      if (!work.rows[0]) throw new NotFoundException("作品不存在");
      if (work.rows[0].author_id !== actor.id) throw new ForbiddenException("只能提交自己的作品");
      if (!["draft", "rejected"].includes(work.rows[0].status)) throw new ConflictException("当前作品不能重复提交");
      const assets = await client.query("SELECT 1 FROM work_assets WHERE work_id=$1 LIMIT 1", [workId]);
      if (!assets.rowCount) throw new BadRequestException("至少添加一个作品资源后才能提交审核");
      await client.query("UPDATE works SET status='pending',published_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=$1", [workId]);
      await client.query("INSERT INTO audit_records (id,target_type,target_id,reviewer_id,action,reason) VALUES ($1,'work',$2,$3,'submit',$4)", [`audit-${randomUUID()}`, workId, actor.id, "用户提交作品审核"]);
      return true;
    });
    if (!result) throw new ConflictException("提交失败");
    return this.getWork(actor, workId);
  }

  async uploadWorkAsset(actor: Actor, workId: string, request: FastifyRequest) {
    const environment = getEnvironment();
    if (!environment.fileUploadsEnabled) throw new ForbiddenException("文件上传未启用");
    const current = await this.database.query<{ status: string; author_id: string; title: string }>("SELECT status,author_id,title FROM works WHERE id=$1", [workId]);
    const work = current.rows[0];
    if (!work) throw new NotFoundException("作品不存在");
    if (work.author_id !== actor.id) throw new ForbiddenException("只能为自己的作品上传资源");
    if (!["draft", "rejected"].includes(work.status)) throw new ConflictException("当前作品不能继续上传资源");
    const part = await request.file();
    if (!part) throw new BadRequestException("请选择一个文件");
    const upload = await storePrivateUpload(part, environment.uploadRoot, undefined, `users/${actor.id}/works/${workId}`);
    try {
      const asset = await this.database.transaction(async (client) => {
        const locked = await client.query<{ status: string; author_id: string }>("SELECT status,author_id FROM works WHERE id=$1 FOR UPDATE", [workId]);
        if (!locked.rows[0] || locked.rows[0].author_id !== actor.id || !["draft", "rejected"].includes(locked.rows[0].status)) throw new ConflictException("作品状态已变化，请刷新后重试");
        const count = await client.query<{ count: number }>("SELECT COUNT(*)::int AS count FROM work_assets WHERE work_id=$1", [workId]);
        if (count.rows[0].count >= 10) throw new BadRequestException("每个作品最多上传 10 个文件");
        const id = `work-asset-${randomUUID()}`;
        await client.query(`
          INSERT INTO work_assets (id,work_id,file_name,mime_type,storage_key,external_url,file_size,sha256,asset_type,alt_text,sort_order,moderation_status)
          VALUES ($1,$2,$3,$4,$5,NULL,$6,$7,$8,$9,$10,'pending')
        `, [id, workId, upload.fileName, upload.mimeType, upload.storageKey, upload.sizeBytes, upload.sha256, upload.assetType, work.title, count.rows[0].count]);
        return { id, fileName: upload.fileName, mimeType: upload.mimeType, sizeBytes: upload.sizeBytes, status: "pending" };
      });
      return asset;
    } catch (error) {
      await import("node:fs/promises").then(({ rm }) => rm(path.join(environment.uploadRoot, upload.storageKey), { force: true }));
      throw error;
    }
  }

  async openWorkAsset(actor: Actor, workId: string, assetId: string) {
    const result = await this.database.query<{ storage_key: string; file_name: string; mime_type: string; status: string; author_id: string; moderation_status: string }>(`
      SELECT asset.storage_key,asset.file_name,asset.mime_type,asset.moderation_status,work.status,work.author_id
      FROM work_assets asset JOIN works work ON work.id=asset.work_id
      WHERE asset.id=$1 AND asset.work_id=$2
    `, [assetId, workId]);
    const asset = result.rows[0];
    if (!asset) throw new NotFoundException("作品资源不存在");
    const canReview = this.canReview(actor);
    const canRead = asset.author_id === actor.id || canReview || (asset.status === "approved" && asset.moderation_status === "approved");
    if (!canRead) throw new ForbiddenException("无权访问该文件");
    const storageKey = asset.storage_key;
    if (!/^[a-f0-9-]{36}-[a-f0-9-]{36}$/i.test(storageKey)) throw new NotFoundException("资源存储记录无效");
    const filePath = path.join(getEnvironment().uploadRoot, storageKey);
    return { fileName: asset.file_name, mimeType: asset.mime_type, stream: createReadStream(filePath) };
  }

  async addComment(actor: Actor, workId: string, content: string) {
    await this.requireApprovedWork(workId);
    const id = `comment-${randomUUID()}`;
    await this.database.query("INSERT INTO comments (id,work_id,author_id,content) VALUES ($1,$2,$3,$4)", [id, workId, actor.id, content]);
    return { id, content, author: actor.displayName, createdAt: new Date().toISOString() };
  }

  async toggleReaction(actor: Actor, workId: string, reaction: string) {
    await this.requireApprovedWork(workId);
    const table = reaction === "like" ? "work_likes" : reaction === "favorite" ? "work_favorites" : null;
    if (!table) throw new BadRequestException("不支持的互动类型");
    const result = await this.database.query(`DELETE FROM ${table} WHERE work_id=$1 AND user_id=$2 RETURNING work_id`, [workId, actor.id]);
    if (result.rowCount) return { active: false };
    await this.database.query(`INSERT INTO ${table} (work_id,user_id) VALUES ($1,$2)`, [workId, actor.id]);
    return { active: true };
  }

  private async getRun(actor: Actor, runId: string) {
    const result = await this.database.query(`
      SELECT r.*,w.name AS workflow_name,w.category,v.definition_json
      FROM workflow_runs r JOIN workflows w ON w.id=r.workflow_id
      JOIN workflow_versions v ON v.id=r.workflow_version_id
      WHERE r.id=$1 AND r.user_id=$2
    `, [runId, actor.id]);
    if (!result.rows[0]) throw new NotFoundException("工作流执行记录不存在");
    return this.mapRun(result.rows[0]);
  }

  private async replaceWorkRelations(client: PoolClient, workId: string, input: WorkInput) {
    if (input.workflowIds.length) {
      const workflows = await client.query("SELECT id FROM workflows WHERE id=ANY($1::text[]) AND status='published'", [input.workflowIds]);
      if (workflows.rowCount !== input.workflowIds.length) throw new BadRequestException("引用的工作流不存在或尚未发布");
    }
    for (const workflowId of input.workflowIds) await client.query("INSERT INTO work_workflows (work_id,workflow_id) VALUES ($1,$2)", [workId, workflowId]);
    for (const tagName of [...new Set(input.tagNames)]) {
      const slug = this.slugify(tagName);
      const tag = await client.query<{ id: string }>(`
        INSERT INTO tags (id,name,slug) VALUES ($1,$2,$3)
        ON CONFLICT (name) DO UPDATE SET name=EXCLUDED.name RETURNING id
      `, [`tag-${randomUUID()}`, tagName, slug]);
      await client.query("INSERT INTO work_tags (work_id,tag_id) VALUES ($1,$2) ON CONFLICT DO NOTHING", [workId, tag.rows[0].id]);
    }
  }

  private workSelect(actorParameter: string) {
    return `SELECT w.id,w.title,w.summary,w.discipline,w.status,w.author_id,author.display_name AS author,w.published_at,w.created_at,
      COUNT(DISTINCT likes.user_id)::int AS like_count,COUNT(DISTINCT favorites.user_id)::int AS favorite_count,
      BOOL_OR(likes.user_id=${actorParameter}) AS liked,BOOL_OR(favorites.user_id=${actorParameter}) AS favorited,
      MIN(assets.external_url) FILTER (WHERE assets.asset_type='image') AS preview_url
      FROM works w JOIN users author ON author.id=w.author_id
      LEFT JOIN work_likes likes ON likes.work_id=w.id LEFT JOIN work_favorites favorites ON favorites.work_id=w.id
      LEFT JOIN work_assets assets ON assets.work_id=w.id`;
  }

  private mapWorkflow(row: Record<string, any>) {
    const definition = this.normalizeWorkflowDefinition(row.definition_json);
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      category: row.category,
      entryType: row.entry_type,
      entryUrl: row.entry_url,
      versionId: row.version_id,
      versionNumber: row.version_number,
      stepCount: Number(row.step_count ?? definition.nodes.length),
      definition,
      nodes: definition.nodes,
      edges: definition.edges,
      steps: this.definitionToSteps(definition),
      promptTemplate: row.prompt_template ?? "",
    };
  }

  private normalizeWorkflowDefinition(definition: Record<string, any> | null | undefined) {
    if (Array.isArray(definition?.nodes)) {
      return {
        schemaVersion: 2,
        nodes: definition.nodes,
        edges: Array.isArray(definition.edges) ? definition.edges : [],
        viewport: definition.viewport ?? { x: 0, y: 0, zoom: 1 },
      };
    }
    return this.legacyStepsToDefinition(Array.isArray(definition?.steps) ? definition.steps : []);
  }

  private legacyStepsToDefinition(steps: Array<Record<string, any>>) {
    const nodes = steps.map((step, index) => ({
      id: step.id || `legacy-step-${index + 1}`,
      type: "note",
      position: { x: 90 + index * 270, y: 180 },
      data: { label: step.title || `步骤 ${index + 1}`, description: step.description ?? "", value: step.instruction ?? "", estimatedMinutes: step.estimatedMinutes ?? 10 },
    }));
    const edges = nodes.slice(1).map((node, index) => ({ id: `legacy-edge-${index + 1}`, source: nodes[index].id, sourceHandle: "output", target: node.id, targetHandle: "input" }));
    return { schemaVersion: 2, nodes, edges, viewport: { x: 0, y: 0, zoom: 1 } };
  }

  private definitionToSteps(definition: { nodes: Array<Record<string, any>>; edges?: Array<Record<string, any>> }) {
    const nodes = definition.nodes;
    const byId = new Map(nodes.map((node) => [node.id, node]));
    const indegree = new Map(nodes.map((node) => [node.id, 0]));
    const next = new Map(nodes.map((node) => [node.id, [] as string[]]));
    for (const edge of definition.edges ?? []) {
      if (!byId.has(edge.source) || !byId.has(edge.target) || edge.source === edge.target) continue;
      next.get(edge.source)?.push(edge.target);
      indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1);
    }
    const order = nodes.map((node) => node.id);
    const ready = order.filter((id) => indegree.get(id) === 0);
    const orderedIds: string[] = [];
    while (ready.length) {
      const id = ready.shift();
      if (!id) break;
      orderedIds.push(id);
      for (const target of next.get(id) ?? []) {
        const remaining = (indegree.get(target) ?? 1) - 1;
        indegree.set(target, remaining);
        if (remaining === 0) ready.push(target);
      }
    }
    const executionOrder = orderedIds.length === nodes.length ? orderedIds : order;
    return executionOrder.map((id, index) => {
      const node = byId.get(id) ?? nodes[index];
      return {
      id: node.id,
      title: node.data?.label ?? `节点 ${index + 1}`,
      description: node.data?.description ?? "",
      instruction: node.data?.value ?? "",
      estimatedMinutes: Number(node.data?.estimatedMinutes ?? 10),
      };
    });
  }

  private mapManagedWorkflow(row: Record<string, any>) {
    const mapped = this.mapWorkflow(row);
    return {
      ...mapped,
      status: row.status,
      creatorId: row.created_by,
      creatorName: row.creator_name ?? "平台",
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      publishedAt: row.published_at,
    };
  }

  private requireWorkflowAccess(actor: Actor, creatorId: string | null) {
    if (!actor.roles.includes("admin") && creatorId !== actor.id) throw new ForbiddenException("只能管理自己创建的工作流");
  }

  private workflowColumn(key: string) {
    const columns: Record<string, string> = { name: "name", description: "description", category: "category", entryType: "entry_type", entryUrl: "entry_url" };
    const column = columns[key];
    if (!column) throw new BadRequestException("包含不支持的工作流字段");
    return column;
  }

  private mapRun(row: Record<string, any>) {
    const definition = this.normalizeWorkflowDefinition(row.definition_json);
    return { id: row.id, workflowId: row.workflow_id, workflowName: row.workflow_name, category: row.category, status: row.status, currentStep: Number(row.current_step), totalSteps: Number(row.total_steps), context: row.context_json ?? {}, definition, nodes: definition.nodes, edges: definition.edges, steps: this.definitionToSteps(definition), startedAt: row.started_at, completedAt: row.completed_at, updatedAt: row.updated_at };
  }

  private mapWork(row: WorkRow) {
    return { id: row.id, title: row.title, summary: row.summary ?? "", discipline: row.discipline ?? "未分类", status: row.status, authorId: row.author_id, author: row.author, likeCount: Number(row.like_count ?? 0), favoriteCount: Number(row.favorite_count ?? 0), liked: Boolean(row.liked), favorited: Boolean(row.favorited), previewUrl: row.preview_url, publishedAt: row.published_at, createdAt: row.created_at };
  }

  private canReview(actor: Actor) { return actor.roles.some((role) => ["admin", "operator", "teacher"].includes(role)); }
  private async requireApprovedWork(workId: string) { const result = await this.database.query("SELECT id FROM works WHERE id=$1 AND status='approved'", [workId]); if (!result.rowCount) throw new NotFoundException("已发布作品不存在"); }
  private slugify(value: string) { const ascii = value.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-").replace(/^-|-$/g, ""); return `${ascii || "tag"}-${randomUUID().slice(0, 8)}`; }
}
