import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { AuthService, type Actor } from "../auth/auth.service";
import { DatabaseService } from "../database/database.service";
import type {
  PageInput,
} from "./content.contracts";
import type { z } from "zod";
import {
  commentSchema, courseInputSchema, lessonInputSchema, progressSchema,
  resourceInputSchema, workflowInputSchema, workflowVersionSchema, workInputSchema, conversationSchema, messageSchema,
} from "./content.contracts";

type CourseInput = z.infer<typeof courseInputSchema>;
type LessonInput = z.infer<typeof lessonInputSchema>;
type ResourceInput = z.infer<typeof resourceInputSchema>;
type WorkflowInput = z.infer<typeof workflowInputSchema>;
type VersionInput = z.infer<typeof workflowVersionSchema>;
type WorkInput = z.infer<typeof workInputSchema>;
type CommentInput = z.infer<typeof commentSchema>;
type ProgressInput = z.infer<typeof progressSchema>;
type ConversationInput = z.infer<typeof conversationSchema>;
type MessageInput = z.infer<typeof messageSchema>;

@Injectable()
export class ContentService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService, @Inject(AuthService) private readonly auth: AuthService) {}

  async listCourses(page: PageInput) {
    const where = ["c.status = 'published'"];
    const values: unknown[] = [];
    if (page.query) { values.push(`%${page.query}%`); where.push(`(c.title ILIKE $${values.length} OR c.summary ILIKE $${values.length})`); }
    if (page.category) { values.push(page.category); where.push(`c.category = $${values.length}`); }
    return this.paginated(`
      SELECT c.id, c.title, c.summary, c.category, c.difficulty, c.cover_asset_key,
        COUNT(DISTINCT l.id)::int AS lesson_count
      FROM courses c LEFT JOIN course_lessons l ON l.course_id = c.id AND l.status = 'published'
      WHERE ${where.join(" AND ")} GROUP BY c.id
      ORDER BY c.is_featured DESC, c.featured_rank NULLS LAST, c.created_at DESC
    `, values, page, (row) => ({ ...row, lessonCount: Number(row.lesson_count), coverAssetKey: row.cover_asset_key }));
  }

  async getCourse(id: string, actorPromise: Promise<Actor>) {
    const actor = await actorPromise;
    const course = (await this.db.query(`SELECT id, title, summary, category, difficulty, cover_asset_key, status, created_at, updated_at FROM courses WHERE id = $1`, [id])).rows[0] as Record<string, unknown> | undefined;
    const includeUnpublished = this.canManageContent(actor);
    if (!course || (course.status !== "published" && !includeUnpublished)) throw new NotFoundException("课程不存在");
    const [lessons, resources, progress] = await Promise.all([
      this.db.query(`SELECT id, title, summary, lesson_type, sort_order, estimated_minutes, status FROM course_lessons WHERE course_id = $1 ${includeUnpublished ? "" : "AND status = 'published'"} ORDER BY sort_order, created_at`, [id]),
      this.db.query(`SELECT id, lesson_id, title, resource_type, storage_key, external_url, file_name, mime_type, file_size, transcript_text, source_name, source_url, copyright_note, sort_order, status FROM course_resources WHERE course_id = $1 ${includeUnpublished ? "" : "AND status = 'published'"} ORDER BY sort_order, created_at`, [id]),
      this.db.query(`SELECT lp.lesson_id, lp.status, lp.progress_percent, lp.watched_seconds, lp.last_position_seconds, lp.completed_at FROM learning_progress lp JOIN course_lessons l ON l.id = lp.lesson_id WHERE l.course_id = $1 AND lp.user_id = $2`, [id, actor.id]),
    ]);
    return { ...course, coverAssetKey: course.cover_asset_key, lessons: lessons.rows, resources: resources.rows, progress: progress.rows };
  }

  async createCourse(actor: Actor, input: CourseInput) {
    this.requireContentRole(actor);
    const id = randomUUID();
    const result = await this.db.query(`INSERT INTO courses (id, title, summary, category, difficulty, cover_asset_key, status, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`, [id, input.title, input.summary ?? null, input.category ?? null, input.difficulty ?? null, input.coverAssetKey ?? null, input.status, actor.id]);
    return result.rows[0];
  }

  async createLesson(actor: Actor, courseId: string, input: LessonInput) {
    this.requireContentRole(actor); await this.requireRow("courses", courseId, "课程不存在");
    const result = await this.db.query(`INSERT INTO course_lessons (id, course_id, title, summary, lesson_type, sort_order, estimated_minutes, status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`, [randomUUID(), courseId, input.title, input.summary ?? null, input.lessonType, input.sortOrder, input.estimatedMinutes ?? null, input.status]);
    return result.rows[0];
  }

  async createResource(actor: Actor, courseId: string, input: ResourceInput) {
    this.requireContentRole(actor); await this.requireRow("courses", courseId, "课程不存在");
    if (input.lessonId) {
      const lesson = await this.db.query(`SELECT id FROM course_lessons WHERE id = $1 AND course_id = $2`, [input.lessonId, courseId]);
      if (!lesson.rowCount) throw new NotFoundException("课时不存在或不属于该课程");
    }
    const result = await this.db.query(`INSERT INTO course_resources (id, course_id, lesson_id, title, resource_type, storage_key, external_url, file_name, mime_type, file_size, transcript_text, source_name, source_url, copyright_note, sort_order, status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`, [randomUUID(), courseId, input.lessonId ?? null, input.title, input.resourceType, input.storageKey ?? null, input.externalUrl ?? null, input.fileName ?? null, input.mimeType ?? null, input.fileSize ?? null, input.transcriptText ?? null, input.sourceName ?? null, input.sourceUrl ?? null, input.copyrightNote ?? null, input.sortOrder, input.status]);
    return result.rows[0];
  }

  async updateCourse(actor: Actor, id: string, input: Partial<CourseInput>) {
    this.requireContentRole(actor); await this.requireRow("courses", id, "课程不存在");
    return this.updateEntity("courses", id, input, {
      title: "title", summary: "summary", category: "category", difficulty: "difficulty",
      coverAssetKey: "cover_asset_key", status: "status",
    });
  }

  async updateLesson(actor: Actor, id: string, input: Partial<LessonInput>) {
    this.requireContentRole(actor); await this.requireRow("course_lessons", id, "课时不存在");
    return this.updateEntity("course_lessons", id, input, {
      title: "title", summary: "summary", lessonType: "lesson_type", sortOrder: "sort_order",
      estimatedMinutes: "estimated_minutes", status: "status",
    });
  }

  async updateResource(actor: Actor, id: string, input: Partial<ResourceInput>) {
    this.requireContentRole(actor); await this.requireRow("course_resources", id, "课程资源不存在");
    return this.updateEntity("course_resources", id, input, {
      title: "title", resourceType: "resource_type", lessonId: "lesson_id", storageKey: "storage_key",
      externalUrl: "external_url", fileName: "file_name", mimeType: "mime_type", fileSize: "file_size",
      transcriptText: "transcript_text", sourceName: "source_name", sourceUrl: "source_url",
      copyrightNote: "copyright_note", sortOrder: "sort_order", status: "status",
    });
  }

  async updateWorkflow(actor: Actor, id: string, input: Partial<WorkflowInput>) {
    this.requireContentRole(actor); await this.requireRow("workflows", id, "工作流不存在");
    return this.updateEntity("workflows", id, input, {
      name: "name", description: "description", category: "category", entryType: "entry_type",
      entryUrl: "entry_url", status: "status",
    });
  }

  async updateTool(actor: Actor, id: string, input: Partial<z.infer<typeof import("./content.contracts").toolInputSchema>>) {
    this.requireContentRole(actor); await this.requireRow("tools", id, "工具不存在");
    return this.updateEntity("tools", id, input, {
      name: "name", description: "description", category: "category", toolType: "tool_type",
      entryUrl: "entry_url", status: "status",
    });
  }

  async updateStatus(actor: Actor, table: "courses" | "workflows" | "tools", id: string, status: string) {
    this.requireContentRole(actor); await this.requireRow(table, id, "资源不存在");
    const allowed = table === "courses" || table === "workflows" || table === "tools";
    if (!allowed || !["draft", "published", "archived"].includes(status)) throw new BadRequestException("状态不合法");
    const result = await this.db.query(`UPDATE ${table} SET status=$1,updated_at=CURRENT_TIMESTAMP WHERE id=$2 RETURNING *`, [status, id]);
    return result.rows[0];
  }

  async updateWorkStatus(actor: Actor, id: string, status: string) {
    await this.requireRow("works", id, "作品不存在");
    if (!["pending", "approved", "rejected", "archived", "draft"].includes(status)) throw new BadRequestException("作品状态不合法");
    if (status !== "draft") this.auth.requireAnyRole(actor, ["admin", "operator", "teacher"]);
    const result = await this.db.query(`UPDATE works SET status=$1,published_at=CASE WHEN $1='approved' THEN COALESCE(published_at,CURRENT_TIMESTAMP) ELSE published_at END,updated_at=CURRENT_TIMESTAMP WHERE id=$2 AND (author_id=$3 OR $1 <> 'draft') RETURNING *`, [status, id, actor.id]);
    if (!result.rowCount) throw new ForbiddenException("无权修改此作品");
    return result.rows[0];
  }

  async updateProgress(actor: Actor, lessonId: string, input: ProgressInput) {
    const lesson = await this.db.query(`SELECT l.id FROM course_lessons l JOIN courses c ON c.id = l.course_id WHERE l.id = $1 AND l.status = 'published' AND c.status = 'published'`, [lessonId]);
    if (!lesson.rowCount) throw new NotFoundException("可学习的课时不存在");
    const result = await this.db.query(`INSERT INTO learning_progress (user_id, lesson_id, status, progress_percent, watched_seconds, last_position_seconds, completed_at) VALUES ($1,$2,$3,$4,$5,$6,CASE WHEN $3 = 'completed' THEN CURRENT_TIMESTAMP ELSE NULL END) ON CONFLICT (user_id, lesson_id) DO UPDATE SET status=EXCLUDED.status, progress_percent=EXCLUDED.progress_percent, watched_seconds=EXCLUDED.watched_seconds, last_position_seconds=EXCLUDED.last_position_seconds, completed_at=EXCLUDED.completed_at, updated_at=CURRENT_TIMESTAMP RETURNING *`, [actor.id, lessonId, input.status, input.progressPercent, input.watchedSeconds, input.lastPositionSeconds]);
    return result.rows[0];
  }

  async listWorkflows(page: PageInput) {
    const where = ["w.status = 'published'"]; const values: unknown[] = [];
    if (page.query) { values.push(`%${page.query}%`); where.push(`(w.name ILIKE $${values.length} OR w.description ILIKE $${values.length})`); }
    if (page.category) { values.push(page.category); where.push(`w.category = $${values.length}`); }
    return this.paginated(`SELECT w.id, w.name, w.description, w.category, w.entry_type, w.entry_url, w.is_featured FROM workflows w WHERE ${where.join(" AND ")} ORDER BY w.is_featured DESC, w.featured_rank NULLS LAST, w.created_at DESC`, values, page, (row) => ({ ...row, entryType: row.entry_type, entryUrl: row.entry_url }));
  }

  async getWorkflow(id: string) {
    const workflow = (await this.db.query(`SELECT id, name, description, category, entry_type, entry_url, status, created_at, updated_at FROM workflows WHERE id = $1 AND status = 'published'`, [id])).rows[0];
    if (!workflow) throw new NotFoundException("工作流不存在");
    const [versions, tools] = await Promise.all([
      this.db.query(`SELECT id, version_number, published_at FROM workflow_versions WHERE workflow_id = $1 AND published_at IS NOT NULL ORDER BY version_number DESC`, [id]),
      this.db.query(`SELECT t.id, t.name, t.description, t.category, t.tool_type, t.entry_url FROM tools t JOIN workflow_tools wt ON wt.tool_id = t.id WHERE wt.workflow_id = $1 AND t.status = 'published' ORDER BY wt.sort_order, t.created_at`, [id]),
    ]);
    return { ...workflow, versions: versions.rows, tools: tools.rows };
  }

  async createWorkflow(actor: Actor, input: WorkflowInput) {
    this.requireContentRole(actor); const result = await this.db.query(`INSERT INTO workflows (id,name,description,category,entry_type,entry_url,status,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`, [randomUUID(), input.name, input.description ?? null, input.category ?? null, input.entryType, input.entryUrl ?? null, input.status, actor.id]); return result.rows[0];
  }

  async createWorkflowVersion(actor: Actor, workflowId: string, input: VersionInput) {
    this.requireContentRole(actor); await this.requireRow("workflows", workflowId, "工作流不存在");
    const next = await this.db.query<{ version: number }>(`SELECT COALESCE(MAX(version_number),0)::int + 1 AS version FROM workflow_versions WHERE workflow_id = $1`, [workflowId]);
    const result = await this.db.query(`INSERT INTO workflow_versions (id,workflow_id,version_number,definition_json,prompt_template,created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`, [randomUUID(), workflowId, next.rows[0].version, input.definitionJson ? JSON.stringify(input.definitionJson) : null, input.promptTemplate ?? null, actor.id]); return result.rows[0];
  }

  async listWorks(page: PageInput, actorPromise: Promise<Actor>) {
    const actor = await actorPromise; const where = ["w.status = 'approved'"]; const values: unknown[] = [];
    if (page.query) { values.push(`%${page.query}%`); where.push(`(w.title ILIKE $${values.length} OR w.summary ILIKE $${values.length})`); }
    if (page.discipline) { values.push(page.discipline); where.push(`w.discipline = $${values.length}`); }
    const result = await this.db.query(`SELECT w.id,w.title,w.summary,w.discipline,w.status,w.published_at,u.display_name AS author,COUNT(DISTINCT wa.id)::int AS assets,COUNT(DISTINCT wl.user_id)::int AS like_count,COUNT(DISTINCT wf.user_id)::int AS favorite_count,BOOL_OR(wl.user_id=$${values.length + 1}) AS liked,BOOL_OR(wf.user_id=$${values.length + 1}) AS favorited FROM works w JOIN users u ON u.id=w.author_id LEFT JOIN work_assets wa ON wa.work_id=w.id LEFT JOIN work_likes wl ON wl.work_id=w.id LEFT JOIN work_favorites wf ON wf.work_id=w.id WHERE ${where.join(" AND ")} GROUP BY w.id,u.display_name ORDER BY w.is_featured DESC,w.featured_rank NULLS LAST,w.published_at DESC NULLS LAST,w.created_at DESC LIMIT $${values.length + 2} OFFSET $${values.length + 3}`, [...values, actor.id, page.pageSize, (page.page - 1) * page.pageSize]);
    const count = await this.db.query(`SELECT COUNT(*)::int AS total FROM works w WHERE ${where.join(" AND ")}`, values);
    return { items: result.rows, page: page.page, pageSize: page.pageSize, total: count.rows[0].total };
  }

  async getWork(id: string, actorPromise: Promise<Actor>) {
    const actor = await actorPromise; const work = (await this.db.query(`SELECT w.*,u.display_name AS author FROM works w JOIN users u ON u.id=w.author_id WHERE w.id=$1 AND (w.status='approved' OR w.author_id=$2)`, [id, actor.id])).rows[0];
    if (!work) throw new NotFoundException("作品不存在");
    const [assets, workflows, comments] = await Promise.all([this.db.query(`SELECT * FROM work_assets WHERE work_id=$1 ORDER BY sort_order,created_at`, [id]), this.db.query(`SELECT w.id,w.name,w.entry_type,w.entry_url,ww.workflow_version_id FROM workflows w JOIN work_workflows ww ON ww.workflow_id=w.id WHERE ww.work_id=$1 AND w.status='published'`, [id]), this.db.query(`SELECT c.id,c.content,c.parent_id,c.created_at,u.display_name AS author FROM comments c JOIN users u ON u.id=c.author_id WHERE c.work_id=$1 AND c.status='published' ORDER BY c.created_at`, [id])]);
    return { ...work, assets: assets.rows, workflows: workflows.rows, comments: comments.rows };
  }

  async createWork(actor: Actor, input: WorkInput) {
    const id = randomUUID();
    await this.db.transaction(async (client) => { await client.query(`INSERT INTO works (id,author_id,title,summary,discipline,status) VALUES ($1,$2,$3,$4,$5,'pending')`, [id,actor.id,input.title,input.summary ?? null,input.discipline ?? null]); await this.linkWork(client,id,input.workflowIds,input.assets); });
    return this.getWork(id,Promise.resolve(actor));
  }

  async updateWork(actor: Actor, id: string, input: Partial<WorkInput>) {
    const existing = (await this.db.query<{ author_id: string; status: string }>(`SELECT author_id,status FROM works WHERE id=$1`, [id])).rows[0]; if (!existing) throw new NotFoundException("作品不存在"); if (existing.author_id !== actor.id && !this.canManage(actor)) throw new ForbiddenException("无权修改此作品");
    const fields: string[] = []; const values: unknown[] = [];
    for (const [key, column] of [["title","title"],["summary","summary"],["discipline","discipline"]] as const) if (input[key] !== undefined) { values.push(input[key]); fields.push(`${column}=$${values.length}`); }
    if (fields.length) {
      if (existing.author_id === actor.id && !this.canManage(actor) && ["approved", "rejected"].includes(existing.status)) {
        fields.push("status='pending'");
        fields.push("published_at=NULL");
      }
      values.push(id); await this.db.query(`UPDATE works SET ${fields.join(",")},updated_at=CURRENT_TIMESTAMP WHERE id=$${values.length}`, values);
    }
    return this.getWork(id,Promise.resolve(actor));
  }

  async listComments(actorPromise: Promise<Actor>, workId: string) { await this.requireInteractiveWork(await actorPromise, workId); return { items: (await this.db.query(`SELECT c.id,c.content,c.parent_id,c.created_at,u.display_name AS author FROM comments c JOIN users u ON u.id=c.author_id WHERE c.work_id=$1 AND c.status='published' ORDER BY c.created_at`, [workId])).rows }; }
  async addComment(actor: Actor, workId: string, input: CommentInput) {
    await this.requireInteractiveWork(actor, workId);
    if (input.parentId) {
      const parent = await this.db.query("SELECT id FROM comments WHERE id = $1 AND work_id = $2 AND status = 'published'", [input.parentId, workId]);
      if (!parent.rowCount) throw new NotFoundException("回复的评论不存在");
    }
    const result=await this.db.query(`INSERT INTO comments (id,work_id,author_id,parent_id,content) VALUES ($1,$2,$3,$4,$5) RETURNING *`,[randomUUID(),workId,actor.id,input.parentId ?? null,input.content]); return result.rows[0];
  }

  async toggleReaction(actor: Actor, workId: string, kind: "like" | "favorite") { await this.requireInteractiveWork(actor, workId); const table=kind === "like" ? "work_likes" : "work_favorites"; const found=await this.db.query(`SELECT 1 FROM ${table} WHERE work_id=$1 AND user_id=$2`,[workId,actor.id]); if(found.rowCount){await this.db.query(`DELETE FROM ${table} WHERE work_id=$1 AND user_id=$2`,[workId,actor.id]);return {active:false};} await this.db.query(`INSERT INTO ${table} (work_id,user_id) VALUES ($1,$2)`,[workId,actor.id]); return {active:true}; }

  async search(page: PageInput) { if (!page.query) throw new BadRequestException("搜索关键词不能为空"); const like=`%${page.query}%`; const [courses,workflows,works,tools]=await Promise.all([this.db.query(`SELECT id,title AS name,'course' AS type FROM courses WHERE status='published' AND (title ILIKE $1 OR summary ILIKE $1) LIMIT $2`,[like,page.pageSize]),this.db.query(`SELECT id,name,'workflow' AS type FROM workflows WHERE status='published' AND (name ILIKE $1 OR description ILIKE $1) LIMIT $2`,[like,page.pageSize]),this.db.query(`SELECT id,title AS name,'work' AS type FROM works WHERE status='approved' AND (title ILIKE $1 OR summary ILIKE $1) LIMIT $2`,[like,page.pageSize]),this.db.query(`SELECT id,name,'tool' AS type FROM tools WHERE status='published' AND (name ILIKE $1 OR description ILIKE $1) LIMIT $2`,[like,page.pageSize])]); return { items:[...courses.rows,...workflows.rows,...works.rows,...tools.rows], query:page.query }; }

  async listTools(page: PageInput) { const values: unknown[]=[]; const where=["t.status='published'"]; if(page.query){values.push(`%${page.query}%`);where.push(`(t.name ILIKE $1 OR t.description ILIKE $1)`);} if(page.category){values.push(page.category);where.push(`t.category=$${values.length}`);} return this.paginated(`SELECT t.id,t.name,t.description,t.category,t.tool_type,t.entry_url,t.is_featured FROM tools t WHERE ${where.join(" AND ")} ORDER BY t.is_featured DESC,t.featured_rank NULLS LAST,t.created_at DESC`,values,page,(row)=>({...row,toolType:row.tool_type,entryUrl:row.entry_url})); }

  async createTool(actor: Actor, input: z.infer<typeof import("./content.contracts").toolInputSchema>) { this.requireContentRole(actor); const result=await this.db.query(`INSERT INTO tools (id,name,description,category,tool_type,entry_url,status,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,[randomUUID(),input.name,input.description ?? null,input.category ?? null,input.toolType,input.entryUrl ?? null,input.status,actor.id]); return result.rows[0]; }

  async listConversations(actor: Actor) { return { items:(await this.db.query(`SELECT id,course_id,workflow_id,conversation_type,title,status,created_at,updated_at FROM conversations WHERE user_id=$1 AND status='active' ORDER BY updated_at DESC`,[actor.id])).rows }; }
  async createConversation(actor: Actor, input: ConversationInput) {
    if (input.courseId) await this.requirePublishedReference("courses", input.courseId, "课程不存在或尚未发布");
    if (input.workflowId) await this.requirePublishedReference("workflows", input.workflowId, "工作流不存在或尚未发布");
    const result=await this.db.query(`INSERT INTO conversations (id,user_id,course_id,workflow_id,conversation_type,title) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,[randomUUID(),actor.id,input.courseId ?? null,input.workflowId ?? null,input.type,input.title ?? null]); return result.rows[0];
  }
  async getConversation(actor: Actor, id: string) { const conversation=(await this.db.query(`SELECT id,course_id,workflow_id,conversation_type,title,status,created_at,updated_at FROM conversations WHERE id=$1 AND user_id=$2`,[id,actor.id])).rows[0]; if(!conversation) throw new NotFoundException("对话不存在"); const messages=await this.db.query(`SELECT id,sender_type,content,model_config_id,created_at FROM conversation_messages WHERE conversation_id=$1 ORDER BY created_at`,[id]); return {...conversation,messages:messages.rows}; }
  async addMessage(actor: Actor, id: string, input: MessageInput) { await this.getConversation(actor,id); const result=await this.db.query(`INSERT INTO conversation_messages (id,conversation_id,sender_type,content) VALUES ($1,$2,'user',$3) RETURNING *`,[randomUUID(),id,input.content]); await this.db.query(`UPDATE conversations SET updated_at=CURRENT_TIMESTAMP WHERE id=$1`,[id]); return {message:result.rows[0],assistant:null,status:"queued_for_model"}; }

  private async paginated(sql: string, values: unknown[], page: PageInput, map: (row: Record<string, any>) => unknown) { const result=await this.db.query<Record<string, any>>(`${sql} LIMIT $${values.length+1} OFFSET $${values.length+2}`,[...values,page.pageSize,(page.page-1)*page.pageSize]); const count=await this.db.query<{total:number}>(`SELECT COUNT(*)::int AS total FROM (${sql}) counted`,values); return {items:result.rows.map(map),page:page.page,pageSize:page.pageSize,total:count.rows[0].total}; }
  private async requireRow(table: string, id: string, message: string) { const allowed = new Set(["courses","course_lessons","course_resources","workflows","works","tools"]); if(!allowed.has(table)) throw new Error("Invalid table"); const row=await this.db.query(`SELECT id FROM ${table} WHERE id=$1`,[id]); if(!row.rowCount) throw new NotFoundException(message); }
  private async requirePublishedReference(table: "courses" | "workflows", id: string, message: string) { const row = await this.db.query(`SELECT id FROM ${table} WHERE id = $1 AND status = 'published'`, [id]); if (!row.rowCount) throw new NotFoundException(message); }
  private async updateEntity(table: string, id: string, input: Record<string, unknown>, columns: Record<string, string>) {
    const assignments: string[] = []; const values: unknown[] = [];
    for (const [key, column] of Object.entries(columns)) if (input[key] !== undefined) { values.push(input[key] ?? null); assignments.push(`${column}=$${values.length}`); }
    if (!assignments.length) return (await this.db.query(`SELECT * FROM ${table} WHERE id=$1`, [id])).rows[0];
    values.push(id); return (await this.db.query(`UPDATE ${table} SET ${assignments.join(",")},updated_at=CURRENT_TIMESTAMP WHERE id=$${values.length} RETURNING *`, values)).rows[0];
  }
  private requireContentRole(actor: Actor) { this.auth.requireAnyRole(actor,["admin","teacher"]); }
  private canManageContent(actor: Actor) { return actor.roles.some((role)=>["admin","teacher"].includes(role)); }
  private canManage(actor: Actor) { return actor.roles.some((role)=>["admin","teacher","operator"].includes(role)); }
  private async requireInteractiveWork(actor: Actor, workId: string) {
    const work = (await this.db.query<{ author_id: string; status: string }>("SELECT author_id, status FROM works WHERE id = $1", [workId])).rows[0];
    if (!work || (work.status !== "approved" && work.author_id !== actor.id && !this.canManage(actor))) throw new NotFoundException("作品不存在");
  }
  private async linkWork(client: PoolClient, workId: string, workflowIds: string[], assets: WorkInput["assets"]) {
    if (workflowIds.length) {
      const workflows = await client.query(`SELECT id FROM workflows WHERE id = ANY($1::text[]) AND status = 'published'`, [workflowIds]);
      if (workflows.rowCount !== workflowIds.length) throw new NotFoundException("引用的工作流不存在或尚未发布");
    }
    for(const workflowId of workflowIds) await client.query(`INSERT INTO work_workflows (work_id,workflow_id) VALUES ($1,$2)`,[workId,workflowId]); for(const asset of assets) await client.query(`INSERT INTO work_assets (id,work_id,file_name,mime_type,storage_key,file_size,asset_type,thumbnail_key,alt_text,sort_order) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,[randomUUID(),workId,asset.fileName,asset.mimeType,asset.storageKey,asset.fileSize ?? null,asset.assetType,asset.thumbnailKey ?? null,asset.altText ?? null,asset.sortOrder]);
  }
}
