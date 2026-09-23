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
import { GenerationService } from "../generation/generation.service";
import { ModelRegistry } from "../generation/model-registry";
import { CreationStorageService } from "../creation-storage/creation-storage.service";
import { storePrivateUpload, workAssetMimeTypes } from "./private-upload";
import { resolveWorkAssetPath } from "./work-asset-path";
import { caseUploadPolicy } from "../../common/upload-policy";
import { assertCasePublication, caseStorySchema, type CaseStory } from "./case-story";
import { extractImageText, findOcrRiskKeywords } from "./content-moderation";
import type {
  CatalogQuery,
  WorkflowInput,
  WorkflowRunInput,
  WorkflowRunProgressInput,
  WorkflowRunExecuteInput,
  WorkflowVersionInput,
  WorkInput, ReportInput, ToolDirectoryLinkInput, ToolDirectoryLinkUpdateInput,
} from "./studio.contracts";

interface WorkRow {
  story_json: Partial<CaseStory>;
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
  constructor(
    private readonly database: DatabaseService,
    private readonly auth: AuthService,
    private readonly generation?: GenerationService,
    private readonly models?: ModelRegistry,
    private readonly creationStorage?: CreationStorageService,
  ) {}

  async listToolDirectoryLinks() {
    const result = await this.database.query(
      "SELECT id,category,name,detail,href,cover_image_url,icon_key,launch_mode,is_featured,sort_order,status FROM tool_directory_links WHERE status='active' ORDER BY category,sort_order,created_at",
    );
    return { items: result.rows.map((row) => this.mapToolDirectoryLink(row)) };
  }

  async listManagedToolDirectoryLinks(actor: Actor) {
    if (!actor.roles.includes("admin")) throw new ForbiddenException("仅管理员可以管理设计工具目录");
    const result = await this.database.query(
      "SELECT id,category,name,detail,href,cover_image_url,icon_key,launch_mode,is_featured,sort_order,status FROM tool_directory_links ORDER BY category,sort_order,created_at",
    );
    return { items: result.rows.map((row) => this.mapToolDirectoryLink(row)) };
  }

  async createToolDirectoryLink(actor: Actor, input: ToolDirectoryLinkInput) {
    if (!actor.roles.includes("admin")) throw new ForbiddenException("仅管理员可以添加设计工具栏目");
    const id = `tool-link-${randomUUID()}`;
    const order = await this.database.query<{ next_order: number }>("SELECT COALESCE(MAX(sort_order), 0) + 1 AS next_order FROM tool_directory_links WHERE category=$1", [input.category]);
    await this.database.query(
      "INSERT INTO tool_directory_links (id,category,name,detail,href,cover_image_url,icon_key,launch_mode,is_featured,sort_order,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
      [id, input.category, input.name, input.detail, input.href, input.coverImageUrl || null, input.iconKey, input.launchMode, input.featured, order.rows[0]?.next_order ?? 1, actor.id],
    );
    return { id, ...input, status: "active", sortOrder: order.rows[0]?.next_order ?? 1 };
  }

  async updateToolDirectoryLink(actor: Actor, toolLinkId: string, input: ToolDirectoryLinkUpdateInput) {
    if (!actor.roles.includes("admin")) throw new ForbiddenException("仅管理员可以管理设计工具目录");
    const result = await this.database.query(
      "UPDATE tool_directory_links SET category=$2,name=$3,detail=$4,href=$5,cover_image_url=$6,icon_key=$7,launch_mode=$8,is_featured=$9,status=$10,updated_by=$11,updated_at=CURRENT_TIMESTAMP WHERE id=$1 RETURNING id,category,name,detail,href,cover_image_url,icon_key,launch_mode,is_featured,sort_order,status",
      [toolLinkId, input.category, input.name, input.detail, input.href, input.coverImageUrl || null, input.iconKey, input.launchMode, input.featured, input.status, actor.id],
    );
    if (!result.rowCount) throw new NotFoundException("设计工具条目不存在");
    return this.mapToolDirectoryLink(result.rows[0]);
  }

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
    if (input.publish) this.assertExecutableDefinition(definition);
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
    const result = await this.database.query(`
      SELECT w.id,w.name,w.description,w.category,w.entry_type,w.entry_url,w.status,w.created_by,
        latest.id AS version_id,latest.version_number,latest.definition_json,latest.prompt_template,
        COALESCE(jsonb_array_length(latest.definition_json->'nodes'), jsonb_array_length(latest.definition_json->'steps'), 0)::int AS step_count
      FROM workflows w
      LEFT JOIN LATERAL (
        SELECT * FROM workflow_versions
        WHERE workflow_id=w.id AND (published_at IS NOT NULL OR w.created_by=$2)
        ORDER BY version_number DESC LIMIT 1
      ) latest ON TRUE
      WHERE w.id=$1 AND (w.status='published' OR w.created_by=$2) AND w.status<>'archived'
    `, [workflowId, actor.id]);
    if (!result.rows[0]) throw new NotFoundException("工作流不存在或尚未发布");
    const workflow = this.mapWorkflow(result.rows[0]);
    if (!workflow.versionId) throw new ConflictException("工作流还没有可运行版本");
    this.assertExecutableDefinition(workflow.definition);
    const initialPrompt = typeof input.context.prompt === "string" ? input.context.prompt.trim().slice(0, 10000) : "";
    const initialSize = typeof input.context.size === "string" && /^\d{3,4}x\d{3,4}$/.test(input.context.size) ? input.context.size : "1024x1024";
    const runContext = { initialPrompt, initialSize, size: initialSize, nodeResults: {}, nodeStates: {} };
    const id = `workflow-run-${randomUUID()}`;
    await this.database.transaction(async (client) => {
      await client.query(`
        INSERT INTO workflow_runs (id,user_id,workflow_id,workflow_version_id,total_steps,context_json)
        VALUES ($1,$2,$3,$4,$5,$6::jsonb)
      `, [id, actor.id, workflowId, workflow.versionId, workflow.stepCount, JSON.stringify(runContext)]);
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

  async getWorkflowRun(actor: Actor, runId: string) { return this.getRun(actor, runId); }

  async updateRun(actor: Actor, runId: string, input: WorkflowRunProgressInput) {
    const current = await this.getRun(actor, runId) as Record<string, any>;
    if (current.status !== "in_progress") throw new ConflictException("该工作流执行已结束");
    if (input.stepIndex !== current.currentStep) throw new ConflictException("只能处理当前步骤");
    const currentNode = current.nodes.find((node: Record<string, any>) => node.id === current.steps[current.currentStep]?.id);
    if (input.action !== "note" && currentNode?.type !== "note") throw new ConflictException("可执行节点必须由服务端实际执行，不能手动跳过");
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

  /** 按连接关系传递上游状态；生成节点通过平台统一模型服务计费和归档。 */
  async executeRun(actor: Actor, runId: string, input: WorkflowRunExecuteInput) {
    const current = await this.getRun(actor, runId) as Record<string, any>;
    if (current.status !== "in_progress") throw new ConflictException("该工作流执行已结束");
    const step = current.steps[current.currentStep];
    const node = current.nodes.find((item: Record<string, any>) => item.id === step?.id);
    if (!node) throw new ConflictException("当前节点不存在，无法执行");
    const claimed = await this.database.query(`UPDATE workflow_runs
      SET context_json=jsonb_set(context_json, '{executing}', jsonb_build_object('step', current_step, 'at', CURRENT_TIMESTAMP), true)
      WHERE id=$1 AND user_id=$2 AND status='in_progress' AND current_step=$3
        AND (context_json->'executing' IS NULL OR (context_json->'executing'->>'at')::timestamptz < CURRENT_TIMESTAMP - INTERVAL '10 minutes')
      RETURNING id`, [runId, actor.id, current.currentStep]);
    if (!claimed.rowCount) throw new ConflictException("该节点正在执行，或执行进度已更新");
    try {
    const saved = this.workflowContext(current.context);
    const parents = current.edges.filter((edge: Record<string, any>) => edge.target === node.id).map((edge: Record<string, any>) => edge.source);
    const context = parents.length
      ? this.mergeNodeStates(saved, parents)
      : this.workflowContext({ prompt: saved.initialPrompt, size: saved.initialSize });
    if (input.prompt && node.type !== "input") throw new BadRequestException("只可在输入节点填写创作需求");
    if (input.referenceFileId && node.type !== "load_image") throw new BadRequestException("只可在参考素材节点上传图片");
    if (input.prompt) context.prompt = input.prompt;
    if (input.referenceFileId) context.referenceFileId = input.referenceFileId;
    const output = await this.executeNode(actor, node, context);
    saved.nodeResults[node.id] = output;
    saved.nodeStates[node.id] = this.snapshotNodeState(context);
    Object.assign(saved, this.snapshotNodeState(context));
    const nextStep = Math.min(current.currentStep + 1, current.totalSteps);
    const completed = nextStep >= current.totalSteps;
    await this.database.transaction(async (client) => {
      await client.query(
        "INSERT INTO workflow_run_events (id,run_id,step_index,event_type,note) VALUES ($1,$2,$3,'execute',$4)",
        [`workflow-event-${randomUUID()}`, runId, current.currentStep, this.executionNote(node, output)],
      );
      await client.query(`UPDATE workflow_runs SET context_json=$2::jsonb,current_step=$3,status=$4,
        completed_at=CASE WHEN $4='completed' THEN CURRENT_TIMESTAMP ELSE NULL END,updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND user_id=$5`,
        [runId, JSON.stringify(saved), nextStep, completed ? "completed" : "in_progress", actor.id],
      );
    });
    return this.getRun(actor, runId);
    } catch (error) {
      await this.database.query("UPDATE workflow_runs SET context_json=context_json-'executing' WHERE id=$1 AND user_id=$2 AND current_step=$3", [runId, actor.id, current.currentStep]);
      throw error;
    }
  }

  private assertExecutableDefinition(definition: { nodes: Array<Record<string, any>>; edges: Array<Record<string, any>> }) {
    if (!definition.nodes.length) throw new BadRequestException("工作流至少需要一个节点");
    const unsupported = definition.nodes.find((node) => ["lora", "controlnet", "upscale", "text_encode", "load_checkpoint", "vae_decode"].includes(node.type));
    if (unsupported) throw new BadRequestException(`“${unsupported.data?.label ?? unsupported.type}”尚无真实执行服务，不能发布`);
    if (definition.nodes.every((node) => node.type === "note")) return;
    const inputIds = definition.nodes.filter((node) => node.type === "input").map((node) => node.id);
    if (!inputIds.length) throw new BadRequestException("可执行工作流需要创作输入节点");
    if (!definition.nodes.some((node) => node.type === "preview" || node.type === "save_image")) throw new BadRequestException("可执行工作流需要成果预览或保存节点");
    const reached = new Set(inputIds);
    let changed = true;
    while (changed) {
      changed = false;
      for (const edge of definition.edges) if (reached.has(edge.source) && !reached.has(edge.target)) { reached.add(edge.target); changed = true; }
    }
    const detached = definition.nodes.find((node) => node.type !== "note" && !reached.has(node.id));
    if (detached) throw new BadRequestException(`节点“${detached.data?.label ?? detached.id}”没有连接到输入`);
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
    const privileged = result.rows[0].author_id === actor.id || this.canReview(actor);
    const story = caseStorySchema.parse(result.rows[0].story_json ?? {});
    const visibleAssets = assets.rows.map(asset => ({ ...asset,
      url: `/api/works/${encodeURIComponent(workId)}/assets/${encodeURIComponent(asset.id)}/download`,
      canDownload: asset.asset_type !== "document" || privileged || story.allowDocumentDownload,
    }));
    return { ...this.mapWork(result.rows[0]), story: privileged ? story : { ...story, authorizationNote: "" }, assets: visibleAssets, tags: tags.rows, workflows: workflows.rows, comments: comments.rows };
  }

  async createWork(actor: Actor, input: WorkInput) {
    const id = `work-${randomUUID()}`;
    await this.database.transaction(async (client) => {
      if (input.story?.coverAssetId || input.story?.steps.some(step => step.assetIds.length)) throw new BadRequestException("请先保存草稿并上传文件，再关联案例图片");
      await client.query("INSERT INTO works (id,author_id,title,summary,discipline,status,story_json) VALUES ($1,$2,$3,$4,$5,'draft',$6::jsonb)", [id, actor.id, input.title, input.summary, input.discipline, JSON.stringify(input.story ?? {})]);
      await this.replaceWorkRelations(client, id, input);
    });
    return this.getWork(actor, id);
  }

  async submitWork(actor: Actor, workId: string) {
    const result = await this.database.transaction(async (client) => {
      const work = await client.query<{ status: string; author_id: string; story_json: CaseStory }>("SELECT status,author_id,story_json FROM works WHERE id=$1 FOR UPDATE", [workId]);
      if (!work.rows[0]) throw new NotFoundException("作品不存在");
      if (work.rows[0].author_id !== actor.id) throw new ForbiddenException("只能提交自己的作品");
      if (!["draft", "rejected"].includes(work.rows[0].status)) throw new ConflictException("当前作品不能重复提交");
      try { assertCasePublication(caseStorySchema.parse(work.rows[0].story_json ?? {})); }
      catch (error) { throw new BadRequestException((error as Error).message); }
      const assets = await client.query("SELECT 1 FROM work_assets WHERE work_id=$1 LIMIT 1", [workId]);
      if (!assets.rowCount) throw new BadRequestException("至少添加一个作品资源后才能提交审核");
      await client.query("UPDATE works SET status='pending',published_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=$1", [workId]);
      await client.query("INSERT INTO audit_records (id,target_type,target_id,reviewer_id,action,reason) VALUES ($1,'work',$2,$3,'submit',$4)", [`audit-${randomUUID()}`, workId, actor.id, "用户提交作品审核"]);
      return true;
    });
    if (!result) throw new ConflictException("提交失败");
    return this.getWork(actor, workId);
  }

  async updateWork(actor: Actor, workId: string, input: WorkInput) {
    await this.database.transaction(async client => {
      const result = await client.query("SELECT author_id,status FROM works WHERE id=$1 FOR UPDATE", [workId]);
      const work = result.rows[0];
      if (!work) throw new NotFoundException("作品不存在");
      if (work.author_id !== actor.id) throw new ForbiddenException("只能编辑自己的草稿");
      if (!["draft", "rejected"].includes(work.status)) throw new ConflictException("审核中或已发布案例不能直接修改");
      if (input.story) {
        const assets = await client.query("SELECT id,asset_type FROM work_assets WHERE work_id=$1", [workId]);
        const ids = new Set(assets.rows.filter(asset => asset.asset_type === "image").map(asset => asset.id));
        const referenced = [input.story.coverAssetId, ...input.story.steps.flatMap(step => step.assetIds)].filter(Boolean);
        if (referenced.some(id => !ids.has(id))) throw new BadRequestException("封面与步骤只能引用本案例的图片");
      }
      await client.query("UPDATE works SET title=$2,summary=$3,discipline=$4,story_json=COALESCE($5::jsonb,story_json),updated_at=CURRENT_TIMESTAMP WHERE id=$1", [workId, input.title, input.summary, input.discipline, input.story ? JSON.stringify(input.story) : null]);
      await this.replaceWorkRelations(client, workId, input);
    });
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
    const policy = caseUploadPolicy();
    const part = await request.file({ limits: { fileSize: policy.videoBytes } });
    if (!part) throw new BadRequestException("请选择一个文件");
    const upload = await storePrivateUpload(part, environment.uploadRoot, workAssetMimeTypes, `users/${actor.id}/works/${workId}`, policy.videoBytes);
    let committed = false;
    try {
      const asset = await this.database.transaction(async (client) => {
        const locked = await client.query<{ status: string; author_id: string }>("SELECT status,author_id FROM works WHERE id=$1 FOR UPDATE", [workId]);
        if (!locked.rows[0] || locked.rows[0].author_id !== actor.id || !["draft", "rejected"].includes(locked.rows[0].status)) throw new ConflictException("作品状态已变化，请刷新后重试");
        // A lost response or cancellation may occur after commit. Retrying identical bytes
        // must reuse the asset, under the same work lock, instead of consuming another slot.
        const existing = await client.query("SELECT id,file_name,mime_type,file_size FROM work_assets WHERE work_id=$1 AND sha256=$2 LIMIT 1", [workId, upload.sha256]);
        if (existing.rows[0]) {
          const row = existing.rows[0];
          return { id: row.id, fileName: row.file_name, mimeType: row.mime_type, sizeBytes: Number(row.file_size), status: "pending", reused: true };
        }
        const count = await client.query<{ count: number }>("SELECT COUNT(*)::int AS count FROM work_assets WHERE work_id=$1", [workId]);
        if (count.rows[0].count >= 10) throw new BadRequestException("每个作品最多上传 10 个文件");
        const id = `work-asset-${randomUUID()}`;
        await client.query(`
          INSERT INTO work_assets (id,work_id,file_name,mime_type,storage_key,external_url,file_size,sha256,asset_type,alt_text,sort_order,moderation_status)
          VALUES ($1,$2,$3,$4,$5,NULL,$6,$7,$8,$9,$10,'pending')
        `, [id, workId, upload.fileName, upload.mimeType, upload.storageKey, upload.sizeBytes, upload.sha256, upload.assetType, work.title, count.rows[0].count]);
        return { id, fileName: upload.fileName, mimeType: upload.mimeType, sizeBytes: upload.sizeBytes, status: "pending" };
      });
      committed = true;
      if ("reused" in asset) await import("node:fs/promises").then(({ rm }) => rm(path.join(environment.uploadRoot, upload.storageKey), { force: true }));
      else if (upload.assetType === "image") await this.autoModerateImageAsset(asset.id, upload.storageKey, actor.id, workId);
      return asset;
    } catch (error) {
      // OCR auditing happens after commit. Its failure must not delete a persisted asset.
      if (!committed) await import("node:fs/promises").then(({ rm }) => rm(path.join(environment.uploadRoot, upload.storageKey), { force: true }));
      throw error;
    }
  }

  async openWorkAsset(actor: Actor, workId: string, assetId: string) {
    const result = await this.database.query<{ storage_key: string; file_name: string; mime_type: string; status: string; author_id: string; moderation_status: string; asset_type: string; story_json: Partial<CaseStory> }>(`
      SELECT asset.storage_key,asset.file_name,asset.mime_type,asset.asset_type,asset.moderation_status,work.status,work.author_id,work.story_json
      FROM work_assets asset JOIN works work ON work.id=asset.work_id
      WHERE asset.id=$1 AND asset.work_id=$2
    `, [assetId, workId]);
    const asset = result.rows[0];
    if (!asset) throw new NotFoundException("作品资源不存在");
    const canReview = this.canReview(actor);
    const canRead = asset.author_id === actor.id || canReview || (asset.status === "approved" && asset.moderation_status === "approved");
    if (!canRead) throw new ForbiddenException("无权访问该文件");
    if (asset.asset_type === "document" && asset.author_id !== actor.id && !canReview && !asset.story_json?.allowDocumentDownload) throw new ForbiddenException("作者未开放原件下载");
    const storageKey = asset.storage_key;
    const filePath = await resolveWorkAssetPath(getEnvironment().uploadRoot, storageKey, asset.author_id, workId);
    return { fileName: asset.file_name, mimeType: asset.mime_type, stream: createReadStream(filePath) };
  }

  async addComment(actor: Actor, workId: string, content: string) {
    await this.requireApprovedWork(workId);
    const id = `comment-${randomUUID()}`;
    await this.database.query("INSERT INTO comments (id,work_id,author_id,content) VALUES ($1,$2,$3,$4)", [id, workId, actor.id, content]);
    return { id, content, author: actor.displayName, createdAt: new Date().toISOString() };
  }

  async reportWork(actor: Actor, workId: string, input: ReportInput) {
    const result = await this.database.query<{ author_id: string }>("SELECT author_id FROM works WHERE id=$1 AND status='approved'", [workId]);
    if (!result.rows[0]) throw new NotFoundException("已发布作品不存在");
    if (result.rows[0].author_id === actor.id) throw new BadRequestException("不能举报自己的作品");
    return this.createReport(actor.id, "work", workId, input);
  }

  async reportComment(actor: Actor, commentId: string, input: ReportInput) {
    const result = await this.database.query<{ author_id: string }>("SELECT c.author_id FROM comments c JOIN works w ON w.id=c.work_id WHERE c.id=$1 AND c.status='published' AND w.status='approved'", [commentId]);
    if (!result.rows[0]) throw new NotFoundException("可举报的评论不存在");
    if (result.rows[0].author_id === actor.id) throw new BadRequestException("不能举报自己的评论");
    return this.createReport(actor.id, "comment", commentId, input);
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

  private async createReport(reporterId: string, targetType: "work" | "comment", targetId: string, input: ReportInput) {
    const id = `report-${randomUUID()}`;
    const result = await this.database.query<{ id: string; status: string }>(`
      INSERT INTO content_reports (id,target_type,target_id,reporter_id,reason,description)
      VALUES ($1,$2,$3,$4,$5,$6)
      ON CONFLICT (target_type,target_id,reporter_id) DO UPDATE SET
        reason=EXCLUDED.reason,description=EXCLUDED.description,status='pending',content_action='keep',handled_by=NULL,handled_note='',handled_at=NULL,updated_at=CURRENT_TIMESTAMP
      RETURNING id,status
    `, [id, targetType, targetId, reporterId, input.reason, input.description]);
    return { id: result.rows[0].id, status: result.rows[0].status };
  }

  private async autoModerateImageAsset(assetId: string, storageKey: string, authorId: string, workId: string) {
    let result: "approved" | "manual_review" = "approved";
    let reason = "OCR 未发现暴力或色情风险词";
    try {
      const filePath = await resolveWorkAssetPath(getEnvironment().uploadRoot, storageKey, authorId, workId);
      const matches = findOcrRiskKeywords(await extractImageText(filePath));
      if (matches.length) {
        result = "manual_review";
        reason = `OCR 命中高风险词：${matches.map((match) => `${match.category}/${match.keyword}`).join("、")}`;
      }
    } catch {
      // OCR 故障不阻断用户上传，但必须显式进入管理员的人工复核队列。
      result = "manual_review";
      reason = "OCR 未完成，需要人工核验图片内容";
    }
    await this.database.query(`
      INSERT INTO asset_moderation_records (id,asset_type,asset_id,result,reason)
      VALUES ($1,'work_asset',$2,$3,$4)
    `, [`asset-ocr-${randomUUID()}`, assetId, result, reason]);
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
    return `SELECT w.id,w.title,w.summary,w.discipline,w.status,w.author_id,w.story_json,author.display_name AS author,w.published_at,w.created_at,
      COUNT(DISTINCT likes.user_id)::int AS like_count,COUNT(DISTINCT favorites.user_id)::int AS favorite_count,
      BOOL_OR(likes.user_id=${actorParameter}) AS liked,BOOL_OR(favorites.user_id=${actorParameter}) AS favorited,
      COALESCE((SELECT '/api/works/' || w.id || '/assets/' || cover.id || '/download' FROM work_assets cover
        WHERE cover.work_id=w.id AND cover.asset_type='image' AND cover.storage_key IS NOT NULL
        AND (w.status<>'approved' OR cover.moderation_status='approved')
        ORDER BY (cover.id=COALESCE(w.story_json->>'coverAssetId','')) DESC,cover.sort_order,cover.created_at LIMIT 1),
        MIN(assets.external_url) FILTER (WHERE assets.asset_type='image')) AS preview_url
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

  private workflowContext(value: Record<string, any> | null | undefined) {
    const context = value && typeof value === "object" ? structuredClone(value) : {} as Record<string, any>;
    context.nodeResults ??= {};
    context.nodeStates ??= {};
    context.adapters ??= [];
    context.size ??= "1024x1024";
    return context as {
      prompt?: string; initialPrompt?: string; initialSize?: string; text?: string; size: string; modelConfigId?: string;
      adapters: Array<{ type: string; value: string }>;
      referenceFileId?: string;
      artifact?: { downloadUrl?: string; fileName?: string; mimeType?: string; fileSize?: number };
      nodeResults: Record<string, unknown>;
      nodeStates: Record<string, Record<string, any>>;
    };
  }

  private snapshotNodeState(context: ReturnType<StudioService["workflowContext"]>) {
    return {
      prompt: context.prompt, text: context.text, size: context.size,
      modelConfigId: context.modelConfigId, referenceFileId: context.referenceFileId,
      artifact: context.artifact, adapters: context.adapters,
    };
  }

  private mergeNodeStates(saved: ReturnType<StudioService["workflowContext"]>, parents: string[]) {
    const states = parents.map((id) => saved.nodeStates[id]).filter(Boolean);
    if (states.length !== parents.length) throw new ConflictException("上游节点尚未全部执行");
    const merged = this.workflowContext({});
    merged.nodeResults = saved.nodeResults;
    merged.nodeStates = saved.nodeStates;
    for (const state of states) {
      for (const key of ["prompt", "text", "size", "modelConfigId", "referenceFileId", "artifact"] as const) {
        if (state[key] !== undefined) (merged as any)[key] = state[key];
      }
      merged.adapters.push(...(state.adapters ?? []));
    }
    return merged;
  }

  private async executeNode(actor: Actor, node: Record<string, any>, context: ReturnType<StudioService["workflowContext"]>) {
    const value = String(node.data?.value ?? "").trim();
    const label = String(node.data?.label ?? node.type);
    const appendPrompt = (piece: string) => { context.prompt = [context.prompt, piece].filter(Boolean).join("\n").trim(); };
    switch (node.type) {
      case "input":
        context.prompt ??= value;
        if (!context.prompt) throw new BadRequestException("输入节点需要在开始运行时填写需求，或设置默认值");
        return { kind: "input", prompt: context.prompt };
      case "load_image":
        if (!context.referenceFileId) throw new BadRequestException("请上传一张已获授权的参考图片");
        return { kind: "reference", source: context.referenceFileId };
      case "prompt": case "text_encode":
        if (!value) throw new BadRequestException(`${label} 需要填写提示词`);
        appendPrompt(value);
        return { kind: "prompt", prompt: context.prompt };
      case "skill":
        if (!value) throw new BadRequestException("Skill 节点需要填写可执行的创作约束");
        appendPrompt(value);
        return { kind: "skill", applied: value };
      case "model":
        // 留空表示使用服务端为 image 能力配置的内部默认模型，避免把供应商选择暴露给学生。
        if (!value) return { kind: "model", modelConfigId: "internal-default" };
        context.modelConfigId = value;
        return { kind: "model", modelConfigId: value };
      case "text_generate": {
        if (!context.prompt) throw new BadRequestException("文本生成节点需要连接创作输入");
        if (!this.generation || !this.models) throw new ConflictException("文本生成服务尚未装配");
        const modelConfigId = this.models.getForJob({ jobType: "chat" }).id;
        const generated = await this.generation.runJob(actor, {
          jobType: "chat", prompt: value ? `${value}\n\n用户需求：${context.prompt}` : context.prompt,
          modelConfigId, parameters: { source: "workflow-canvas", workflowNodeId: node.id },
        });
        context.text = generated.output.content;
        return { kind: "generated_text", jobId: generated.job.id, text: context.text };
      }
      case "load_checkpoint":
        if (!value) throw new BadRequestException(`${label} 需要填写服务端模型配置 ID`);
        context.modelConfigId = value;
        return { kind: "model", modelConfigId: value };
      case "lora": case "controlnet":
        throw new BadRequestException(`${label} 尚无可用的 GPU 执行服务，请移除该节点后运行`);
      case "empty_latent": {
        context.size = /^\d{3,4}x\d{3,4}$/.test(value) ? value : context.size;
        return { kind: "latent", size: context.size };
      }
      case "ksampler": {
        if (!context.prompt) throw new BadRequestException("KSampler 前必须连接输入或提示词节点");
        if (!this.generation) throw new ConflictException("生成服务尚未装配");
        const reference = context.referenceFileId
          ? await this.creationStorage?.readImageForVision(actor, context.referenceFileId)
          : undefined;
        if (context.referenceFileId && !reference) throw new ConflictException("参考图片服务尚未装配");
        if (reference && !this.models?.getForJob({ jobType: "image", modelConfigId: context.modelConfigId }).capabilities.includes("vision")) {
          throw new BadRequestException("当前图片模型不支持参考图；请切换支持视觉输入的模型，或移除参考素材节点");
        }
        const generated = await this.generation.runJob(actor, {
          jobType: "image", prompt: context.prompt,
          context: reference ? [{ role: "user", content: `这是用户已授权的参考图片“${reference.fileName}”。仅用于提取构图、色彩、材质或风格特征，不复制具体作品。`, images: [{ dataUrl: reference.dataUrl, detail: "high" }] }] : [],
          modelConfigId: context.modelConfigId,
          parameters: { size: context.size, source: "workflow-canvas", workflowNodeId: node.id, adapters: context.adapters },
        });
        if (!generated.artifact) throw new ConflictException("图片服务未返回可保存产物");
        context.artifact = generated.artifact;
        return { kind: "generation", jobId: generated.job.id, artifact: generated.artifact };
      }
      case "vae_decode":
        if (!context.artifact) throw new BadRequestException("VAE 解码前必须先完成 KSampler 生成");
        return { kind: "decoded_image", artifact: context.artifact };
      case "upscale":
        throw new BadRequestException("超分节点尚无可用执行服务，请移除该节点后运行");
      case "preview":
        return { kind: "preview", artifact: context.artifact ?? null, text: context.text ?? context.prompt ?? "" };
      case "save_image":
        if (!context.artifact) throw new BadRequestException("保存图片前必须先完成图片生成");
        return { kind: "saved_asset", artifact: context.artifact };
      case "note":
        return { kind: "note", text: value || node.data?.description || "" };
      default:
        throw new BadRequestException(`暂不支持执行节点类型 ${node.type}`);
    }
  }

  private executionNote(node: Record<string, any>, output: Record<string, any>) {
    return `${node.data?.label ?? node.type}：${output.kind === "generation" ? `生成任务 ${output.jobId}` : output.kind}`.slice(0, 2000);
  }

  private mapWork(row: WorkRow) {
    return { id: row.id, title: row.title, summary: row.summary ?? "", discipline: row.discipline ?? "未分类", status: row.status, authorId: row.author_id, author: row.author, creators: row.story_json?.creators ?? [], tools: row.story_json?.tools ?? [], methods: row.story_json?.methods ?? [], origin: row.story_json?.origin ?? "unspecified", likeCount: Number(row.like_count ?? 0), favoriteCount: Number(row.favorite_count ?? 0), liked: Boolean(row.liked), favorited: Boolean(row.favorited), previewUrl: row.preview_url, publishedAt: row.published_at, createdAt: row.created_at };
  }

  // 对外只暴露目录展示所需字段；不返回维护者身份，避免把后台账号信息带到学生端。
  private mapToolDirectoryLink(row: Record<string, any>) {
    return {
      id: row.id,
      category: row.category,
      name: row.name,
      detail: row.detail,
      href: row.href,
      coverImageUrl: row.cover_image_url ?? "",
      iconKey: row.icon_key ?? "link",
      launchMode: row.launch_mode ?? "new_tab",
      featured: Boolean(row.is_featured),
      status: row.status,
      sortOrder: Number(row.sort_order),
    };
  }

  private canReview(actor: Actor) { return actor.roles.some((role) => ["admin", "operator", "teacher"].includes(role)); }
  private async requireApprovedWork(workId: string) { const result = await this.database.query("SELECT id FROM works WHERE id=$1 AND status='approved'", [workId]); if (!result.rowCount) throw new NotFoundException("已发布作品不存在"); }
  private slugify(value: string) { const ascii = value.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-").replace(/^-|-$/g, ""); return `${ascii || "tag"}-${randomUUID().slice(0, 8)}`; }
}
