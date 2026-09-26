import { randomUUID } from "node:crypto";
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { rm, stat } from "node:fs/promises";
import path from "node:path";
import type { FastifyRequest } from "fastify";
import type { PoolClient, QueryResultRow } from "pg";
import { ADMIN_MANAGEMENT_ROLES, COURSE_REVIEW_ROLES } from "../../common/constants";
import { AuthService, type Actor } from "../auth/auth.service";
import { DatabaseService } from "../database/database.service";
import { getEnvironment } from "../../common/environment";
import { courseUploadPolicy } from "../../common/upload-policy";
import { storePrivateUpload } from "../studio/private-upload";
import { RagService } from "../rag/rag.service";
import { uploadCourseResourceMetadataSchema } from "./courses.contracts";
import type {
  CourseReviewDecisionInput,
  CreateCourseInput,
  ProgressInput,
  UpdateCourseInput,
  UpdateCourseResourceMetadataInput,
} from "./courses.contracts";

interface CourseRow extends QueryResultRow {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  category: string | null;
  difficulty: string | null;
  cover_asset_key: string | null;
  cover_url: string | null;
  cover_mime_type: string | null;
  is_featured: boolean;
  status: string;
  rejection_note: string | null;
  version_number: number;
  estimated_minutes: number;
  created_by: string | null;
  creator_name?: string | null;
  lesson_count?: number;
  enrollment_count?: number;
  progress_percent?: number;
  enrollment_status?: string | null;
  updated_at: Date;
}

interface LessonRow extends QueryResultRow {
  id: string;
  title: string;
  summary: string | null;
  lesson_type: string;
  sort_order: number;
  estimated_minutes: number | null;
  workflow_id: string | null;
  model_config_ids: string[];
  progress_percent: number;
  progress_status: string;
}

interface ReviewRow extends QueryResultRow {
  id: string;
  course_id: string;
  course_title: string;
  snapshot_version: number;
  status: string;
  note: string | null;
  submitter_name: string;
  reviewer_name: string | null;
  submitted_at: Date;
  decided_at: Date | null;
}

interface CourseResourceRow extends QueryResultRow {
  id: string;
  course_id: string;
  title: string;
  storage_key: string | null;
  file_name: string | null;
  mime_type: string | null;
  transcript_text: string | null;
  status: string;
  course_status: string;
  resource_type: string;
  file_size: number | null;
  summary?: string;
  tags?: string[];
  cover_url?: string | null;
  cover_asset_key?: string | null;
  cover_mime_type?: string | null;
  lesson_id?: string | null;
  created_by: string | null;
  enrolled: boolean;
}

const courseResourceMimeTypes = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "video/mp4",
  "video/webm",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/svg+xml",
  "image/avif",
  "image/bmp",
  "text/html",
  "text/css",
  "text/javascript",
] as const;
const coverMimeTypes = ["image/jpeg", "image/png", "image/webp"] as const;
const MAX_COVER_BYTES = 2 * 1024 * 1024;

@Injectable()
export class CoursesService {
  constructor(
    private readonly database: DatabaseService,
    private readonly authService: AuthService,
    private readonly ragService: RagService,
  ) {}

  async listPublished(actor: Actor, filters: { query?: string; category?: string; difficulty?: string; featured?: string }) {
    const values: unknown[] = [actor.id];
    const clauses = ["c.status = 'published'"];
    if (filters.query) {
      values.push(`%${filters.query}%`);
      clauses.push(`(c.title ILIKE $${values.length} OR COALESCE(c.summary, '') ILIKE $${values.length})`);
    }
    if (filters.category) {
      values.push(filters.category);
      clauses.push(`c.category = $${values.length}`);
    }
    if (filters.difficulty) {
      values.push(filters.difficulty);
      clauses.push(`c.difficulty = $${values.length}`);
    }
    if (filters.featured) {
      values.push(filters.featured === "true");
      clauses.push(`c.is_featured = $${values.length}`);
    }

    const result = await this.database.query<CourseRow>(`
      SELECT c.*, u.display_name AS creator_name,
        COUNT(DISTINCT l.id)::int AS lesson_count,
        COUNT(DISTINCT all_e.id)::int AS enrollment_count,
        COALESCE(ROUND(AVG(p.progress_percent)), 0)::int AS progress_percent,
        MAX(my_e.status) AS enrollment_status
      FROM courses c
      LEFT JOIN users u ON u.id = c.created_by
      LEFT JOIN course_lessons l ON l.course_id = c.id AND l.status = 'published'
      LEFT JOIN learning_progress p ON p.lesson_id = l.id AND p.user_id = $1
      LEFT JOIN course_enrollments all_e ON all_e.course_id = c.id
      LEFT JOIN course_enrollments my_e ON my_e.course_id = c.id AND my_e.user_id = $1
      WHERE ${clauses.join(" AND ")}
      GROUP BY c.id, u.display_name
      ORDER BY c.is_featured DESC, c.featured_rank NULLS LAST, c.updated_at DESC
    `, values);
    return { items: result.rows.map((row) => this.mapCourse(row)) };
  }

  async getPublished(actor: Actor, courseId: string) {
    const courseResult = await this.database.query<CourseRow>(`
      SELECT c.*, u.display_name AS creator_name,
        COUNT(DISTINCT l.id)::int AS lesson_count,
        COUNT(DISTINCT all_e.id)::int AS enrollment_count,
        COALESCE(ROUND(AVG(p.progress_percent)), 0)::int AS progress_percent,
        MAX(my_e.status) AS enrollment_status
      FROM courses c
      LEFT JOIN users u ON u.id = c.created_by
      LEFT JOIN course_lessons l ON l.course_id = c.id AND l.status = 'published'
      LEFT JOIN learning_progress p ON p.lesson_id = l.id AND p.user_id = $1
      LEFT JOIN course_enrollments all_e ON all_e.course_id = c.id
      LEFT JOIN course_enrollments my_e ON my_e.course_id = c.id AND my_e.user_id = $1
      WHERE c.id = $2 AND c.status = 'published'
      GROUP BY c.id, u.display_name
    `, [actor.id, courseId]);
    const course = courseResult.rows[0];
    if (!course) throw new NotFoundException("课程不存在或尚未发布");
    // 课件预览面向课程创建教师/管理员与已选课学生。
    const isManager = actor.roles.includes("admin") || (actor.roles.includes("teacher") && course.created_by === actor.id);
    const canViewMaterials = isManager || Boolean(course.enrollment_status);

    const [lessons, resources] = await Promise.all([
      this.database.query<LessonRow>(`
        SELECT l.id, l.title, l.summary, l.lesson_type, l.sort_order, l.estimated_minutes,
          l.workflow_id, l.model_config_ids,
          COALESCE(p.progress_percent, 0)::int AS progress_percent,
          COALESCE(p.status, 'not_started') AS progress_status
        FROM course_lessons l
        LEFT JOIN learning_progress p ON p.lesson_id = l.id AND p.user_id = $1
        WHERE l.course_id = $2 AND l.status = 'published'
        ORDER BY l.sort_order, l.created_at
      `, [actor.id, courseId]),
      this.database.query<CourseResourceRow & { lesson_id: string | null; resource_type: string; external_url: string | null; sort_order: number }>(`
        SELECT id, course_id, lesson_id, title, summary, tags, cover_url, cover_asset_key, cover_mime_type,
          resource_type, storage_key, external_url, file_name,
          mime_type, transcript_text, sort_order, status, 'published'::text AS course_status
        FROM course_resources
        WHERE course_id = $1 AND status = 'published'
        ORDER BY sort_order, created_at
      `, [courseId]),
    ]);
    return {
      ...this.mapCourse(course),
      lessons: lessons.rows.map((lesson) => ({
        id: lesson.id,
        title: lesson.title,
        summary: lesson.summary ?? "",
        lessonType: lesson.lesson_type,
        sortOrder: lesson.sort_order,
        estimatedMinutes: lesson.estimated_minutes ?? 0,
        workflowId: lesson.workflow_id,
        modelConfigIds: lesson.model_config_ids ?? [],
        progressPercent: lesson.progress_percent,
        progressStatus: lesson.progress_status,
      })),
      resources: resources.rows.map((resource) => ({
        id: resource.id,
        lessonId: resource.lesson_id,
        title: resource.title,
        summary: resource.summary ?? "",
        tags: resource.tags ?? [],
        coverUrl: resource.cover_url,
        coverImageUrl: resource.cover_asset_key && resource.cover_mime_type
          ? `/api/courses/${courseId}/resources/${resource.id}/cover` : null,
        resourceType: resource.resource_type,
        externalUrl: resource.external_url,
        fileName: resource.file_name,
        mimeType: resource.mime_type,
        transcriptText: resource.transcript_text,
        sortOrder: resource.sort_order,
        // 课件原件不直接暴露存储路径：预览与下载统一走受控 API，已选课即可使用。
        // 网页课件与视频只提供在线预览，学生端不给下载地址；Office 原件浏览器无法内嵌渲染，
        // 因此保留下载入口（下载后用本机 PowerPoint / WPS 打开）。课程管理者不受这条限制。
        previewUrl: resource.storage_key && canViewMaterials
          ? `/api/courses/${courseId}/resources/${resource.id}/preview`
          : null,
        downloadUrl: resource.storage_key && canViewMaterials && (isManager || studentMayDownload(resource.resource_type, resource.mime_type))
          ? `/api/courses/${courseId}/resources/${resource.id}/download`
          : null,
      })),
    };
  }

  async enroll(actor: Actor, courseId: string) {
    const published = await this.database.query("SELECT id FROM courses WHERE id = $1 AND status = 'published'", [courseId]);
    if (!published.rows[0]) throw new NotFoundException("课程不存在或尚未发布");
    await this.database.query(`
      INSERT INTO course_enrollments (id, user_id, course_id)
      VALUES ($1, $2, $3)
      ON CONFLICT (user_id, course_id) DO UPDATE
      SET status = 'in_progress', completed_at = NULL, updated_at = CURRENT_TIMESTAMP
    `, [randomUUID(), actor.id, courseId]);
    return this.getPublished(actor, courseId);
  }

  async updateProgress(actor: Actor, courseId: string, lessonId: string, input: ProgressInput) {
    const lesson = await this.database.query(`
      SELECT l.id FROM course_lessons l JOIN courses c ON c.id = l.course_id
      WHERE l.id = $1 AND l.course_id = $2 AND l.status = 'published' AND c.status = 'published'
    `, [lessonId, courseId]);
    if (!lesson.rows[0]) throw new NotFoundException("课程课时不存在");
    await this.enroll(actor, courseId);
    const status = input.progressPercent >= 100 ? "completed" : input.progressPercent > 0 ? "in_progress" : "not_started";
    await this.database.transaction(async (client) => {
      await client.query(`
        INSERT INTO learning_progress (
          user_id, lesson_id, status, progress_percent, watched_seconds,
          last_position_seconds, completed_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, CASE WHEN $4 = 100 THEN CURRENT_TIMESTAMP END, CURRENT_TIMESTAMP)
        ON CONFLICT (user_id, lesson_id) DO UPDATE SET
          status = EXCLUDED.status,
          progress_percent = GREATEST(learning_progress.progress_percent, EXCLUDED.progress_percent),
          watched_seconds = GREATEST(learning_progress.watched_seconds, EXCLUDED.watched_seconds),
          last_position_seconds = EXCLUDED.last_position_seconds,
          completed_at = CASE WHEN EXCLUDED.progress_percent = 100 THEN COALESCE(learning_progress.completed_at, CURRENT_TIMESTAMP) ELSE learning_progress.completed_at END,
          updated_at = CURRENT_TIMESTAMP
      `, [actor.id, lessonId, status, input.progressPercent, input.watchedSeconds, input.lastPositionSeconds]);
      const remaining = await client.query(`
        SELECT COUNT(*)::int AS remaining
        FROM course_lessons l
        LEFT JOIN learning_progress p ON p.lesson_id = l.id AND p.user_id = $1
        WHERE l.course_id = $2 AND l.status = 'published' AND COALESCE(p.progress_percent, 0) < 100
      `, [actor.id, courseId]);
      if (Number(remaining.rows[0]?.remaining ?? 1) === 0) {
        await client.query(`
          UPDATE course_enrollments SET status = 'completed', completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
          WHERE user_id = $1 AND course_id = $2
        `, [actor.id, courseId]);
      }
    });
    return this.getPublished(actor, courseId);
  }

  async getMyLearning(actor: Actor) {
    const result = await this.database.query<CourseRow>(`
      SELECT c.*, u.display_name AS creator_name,
        COUNT(DISTINCT l.id)::int AS lesson_count,
        0::int AS enrollment_count,
        COALESCE(ROUND(AVG(p.progress_percent)), 0)::int AS progress_percent,
        e.status AS enrollment_status
      FROM course_enrollments e
      JOIN courses c ON c.id = e.course_id
      LEFT JOIN users u ON u.id = c.created_by
      LEFT JOIN course_lessons l ON l.course_id = c.id AND l.status = 'published'
      LEFT JOIN learning_progress p ON p.lesson_id = l.id AND p.user_id = e.user_id
      WHERE e.user_id = $1 AND e.status <> 'withdrawn'
      GROUP BY c.id, u.display_name, e.status, e.updated_at
      ORDER BY e.updated_at DESC
    `, [actor.id]);
    return { items: result.rows.map((row) => this.mapCourse(row)) };
  }

  /** “我的资源”只返回当前用户实际打开过的已发布课件，访问日志同时成为继续学习入口。 */
  async getRecentResources(actor: Actor) {
    const result = await this.database.query(`
      SELECT DISTINCT ON (event.resource_id) event.resource_id AS "resourceId",resource.course_id AS "courseId",
        resource.title,resource.resource_type AS "resourceType",course.title AS "courseTitle",
        event.access_kind AS "accessKind",event.created_at AS "lastAccessedAt"
      FROM course_resource_access_events event
      JOIN course_resources resource ON resource.id=event.resource_id
      JOIN courses course ON course.id=resource.course_id
      WHERE event.user_id=$1 AND resource.status='published' AND course.status='published'
      ORDER BY event.resource_id,event.created_at DESC
    `, [actor.id]);
    return { items: result.rows.sort((left: any, right: any) => new Date(right.lastAccessedAt).getTime() - new Date(left.lastAccessedAt).getTime()).slice(0, 12) };
  }

  async listManaged(actor: Actor) {
    this.authService.requireAnyRole(actor, ADMIN_MANAGEMENT_ROLES);
    const admin = actor.roles.includes("admin");
    const result = await this.database.query<CourseRow>(`
      SELECT c.*, u.display_name AS creator_name,
        COUNT(DISTINCT l.id)::int AS lesson_count,
        COUNT(DISTINCT e.id)::int AS enrollment_count,
        0::int AS progress_percent, NULL::text AS enrollment_status
      FROM courses c
      LEFT JOIN users u ON u.id = c.created_by
      LEFT JOIN course_lessons l ON l.course_id = c.id
      LEFT JOIN course_enrollments e ON e.course_id = c.id
      WHERE $1::boolean OR c.created_by = $2
      GROUP BY c.id, u.display_name
      ORDER BY c.updated_at DESC
    `, [admin, actor.id]);
    return { items: result.rows.map((row) => this.mapCourse(row)) };
  }

  async getManagedDetail(actor: Actor, courseId: string) {
    this.authService.requireAnyRole(actor, ADMIN_MANAGEMENT_ROLES);
    const course = await this.getManaged(actor, courseId);
    const [lessons, resources] = await Promise.all([
      this.database.query<LessonRow>(`
        SELECT id,title,summary,lesson_type,sort_order,estimated_minutes,workflow_id,model_config_ids,
          0::int AS progress_percent,'not_started'::text AS progress_status
        FROM course_lessons WHERE course_id=$1 ORDER BY sort_order,created_at
      `, [courseId]),
      this.database.query<CourseResourceRow>(`
        SELECT id,course_id,lesson_id,title,summary,tags,cover_url,cover_asset_key,cover_mime_type,resource_type,file_name,mime_type,file_size,status
        FROM course_resources WHERE course_id=$1 ORDER BY sort_order,created_at
      `, [courseId]),
    ]);
    return {
      ...course,
      lessons: lessons.rows.map((lesson) => ({
        id: lesson.id, title: lesson.title, summary: lesson.summary ?? "", lessonType: lesson.lesson_type,
        estimatedMinutes: lesson.estimated_minutes ?? 0, workflowId: lesson.workflow_id,
        modelConfigIds: lesson.model_config_ids ?? [],
      })),
      resources: resources.rows.map((resource) => ({
        id: resource.id, lessonId: resource.lesson_id, title: resource.title,
        summary: resource.summary ?? "", tags: resource.tags ?? [], coverUrl: resource.cover_url,
        coverImageUrl: resource.cover_asset_key && resource.cover_mime_type
          ? `/api/courses/${courseId}/resources/${resource.id}/cover` : null,
        resourceType: resource.resource_type, fileName: resource.file_name, mimeType: resource.mime_type,
        sizeBytes: resource.file_size, status: resource.status,
      })),
    };
  }

  async uploadResource(actor: Actor, courseId: string, request: FastifyRequest) {
    if (!getEnvironment().fileUploadsEnabled) throw new ForbiddenException("文件上传未启用");
    const course = await this.getOwnedCourse(actor, courseId);
    if (!["draft", "rejected"].includes(course.status)) throw new ConflictException("只有草稿或已驳回课程可以上传资料");
    const policy = courseUploadPolicy();
    // 全局 multipart 上限是 10 MiB，这里按课件策略放宽（视频 100 MiB，其他仍 10 MiB）。
    const part = await request.file({ limits: { fileSize: policy.videoBytes } });
    if (!part) throw new BadRequestException("请选择课件文件：PDF、Word、PPT、视频、图片，或 HTML/CSS/JS 前端界面");
    const metadataField = part.fields.metadata;
    if (!metadataField || Array.isArray(metadataField) || metadataField.type !== "field" || typeof metadataField.value !== "string") {
      throw new BadRequestException("请填写资料标题和上传信息");
    }
    let metadataJson: unknown;
    try { metadataJson = JSON.parse(metadataField.value); }
    catch { throw new BadRequestException("资料信息不是有效的 JSON"); }
    const parsed = uploadCourseResourceMetadataSchema.safeParse(metadataJson);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues.map((issue) => issue.message).join("；"));
    const metadata = parsed.data;
    const upload = await storePrivateUpload(part, getEnvironment().uploadRoot, courseResourceMimeTypes, `admin/courses/${courseId}`, policy.videoBytes);
    try {
      const resource = await this.database.transaction(async (client) => {
        const locked = await client.query<{ status: string; created_by: string | null }>("SELECT status,created_by FROM courses WHERE id=$1 FOR UPDATE", [courseId]);
        if (!locked.rows[0]) throw new NotFoundException("课程不存在");
        if (!actor.roles.includes("admin") && locked.rows[0].created_by !== actor.id) throw new ForbiddenException("只能管理自己创建的课程");
        if (!["draft", "rejected"].includes(locked.rows[0].status)) throw new ConflictException("课程状态已变化，请刷新后重试");
        const count = await client.query<{ count: number }>("SELECT COUNT(*)::int AS count FROM course_resources WHERE course_id=$1", [courseId]);
        if (count.rows[0].count >= 30) throw new BadRequestException("每门课程最多上传 30 个资料文件");
        await this.assertLessonBelongsToCourse(client, courseId, metadata.lessonId);
        const id = `course-resource-${randomUUID()}`;
        await client.query(`
          INSERT INTO course_resources (id,course_id,lesson_id,title,summary,tags,cover_url,resource_type,storage_key,external_url,file_name,mime_type,file_size,source_name,sort_order,status)
          VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,NULL,$10,$11,$12,$13,$14,'published')
        `, [id, courseId, metadata.lessonId ?? null, metadata.title, metadata.summary,
          JSON.stringify(metadata.tags), metadata.coverUrl ?? null,
          resourceTypeForMime(upload.mimeType as typeof courseResourceMimeTypes[number]), upload.storageKey,
          upload.fileName, upload.mimeType, upload.sizeBytes, actor.displayName, count.rows[0].count]);
        return { id, ...metadata, fileName: upload.fileName, mimeType: upload.mimeType, sizeBytes: upload.sizeBytes };
      });
      // RAG 是课件上传后的异步能力。队列表未迁移或 Provider 未接入时，
      // 不能让已保存的原始课件被回滚或误删。
      const rag = upload.mimeType === "application/pdf"
        ? await this.ragService.enqueueResource(courseId, resource.id).catch(() => ({ queued: false, reason: "索引队列暂不可用" }))
        : { queued: false, reason: "RAG 第一版仅接收 PDF" };
      return { ...resource, rag };
    } catch (error) {
      await import("node:fs/promises").then(({ rm }) => rm(path.join(getEnvironment().uploadRoot, upload.storageKey), { force: true }));
      throw error;
    }
  }

  async uploadCover(actor: Actor, courseId: string, request: FastifyRequest, resourceId?: string) {
    if (!getEnvironment().fileUploadsEnabled) throw new ForbiddenException("文件上传未启用");
    this.authService.requireAnyRole(actor, ADMIN_MANAGEMENT_ROLES);
    const managed = await this.getOwnedCourse(actor, courseId);
    if (!["draft", "rejected"].includes(managed.status)) throw new ConflictException("只有草稿或已驳回课程可以更换封面");
    const part = await request.file();
    if (!part) throw new BadRequestException("请选择 JPG、PNG 或 WebP 封面图片");
    const prefix = resourceId
      ? `admin/courses/${courseId}/resources/${resourceId}/covers`
      : `admin/courses/${courseId}/covers`;
    const upload = await storePrivateUpload(part, getEnvironment().uploadRoot, coverMimeTypes, prefix);
    let previousKey: string | null = null;
    try {
      if (upload.sizeBytes > MAX_COVER_BYTES) throw new BadRequestException("封面图片不能超过 2 MiB");
      await this.database.transaction(async (client) => {
        const course = await client.query<{ status: string; created_by: string | null; cover_asset_key: string | null }>(
          "SELECT status,created_by,cover_asset_key FROM courses WHERE id=$1 FOR UPDATE", [courseId]);
        if (!course.rows[0]) throw new NotFoundException("课程不存在");
        if (!actor.roles.includes("admin") && course.rows[0].created_by !== actor.id) throw new ForbiddenException("只能管理自己创建的课程");
        if (!["draft", "rejected"].includes(course.rows[0].status)) throw new ConflictException("只有草稿或已驳回课程可以更换封面");
        if (resourceId) {
          const resource = await client.query<{ cover_asset_key: string | null }>(
            "SELECT cover_asset_key FROM course_resources WHERE id=$1 AND course_id=$2 FOR UPDATE", [resourceId, courseId]);
          if (!resource.rows[0]) throw new NotFoundException("课程资料不存在");
          previousKey = resource.rows[0].cover_asset_key;
          await client.query(`UPDATE course_resources SET cover_asset_key=$3,cover_mime_type=$4,cover_url=NULL,updated_at=CURRENT_TIMESTAMP
            WHERE id=$1 AND course_id=$2`, [resourceId, courseId, upload.storageKey, upload.mimeType]);
        } else {
          previousKey = course.rows[0].cover_asset_key;
          await client.query(`UPDATE courses SET cover_asset_key=$2,cover_mime_type=$3,cover_url=NULL,
            version_number=version_number+1,updated_at=CURRENT_TIMESTAMP WHERE id=$1`,
          [courseId, upload.storageKey, upload.mimeType]);
        }
      });
    } catch (error) {
      await rm(path.join(getEnvironment().uploadRoot, ...upload.storageKey.split("/")), { force: true });
      throw error;
    }
    const oldKey = previousKey as string | null;
    if (oldKey?.startsWith(`${prefix}/`) && /^[a-f0-9-]{36}-[a-f0-9-]{36}$/i.test(oldKey.slice(prefix.length + 1))) {
      await rm(path.join(getEnvironment().uploadRoot, ...oldKey.split("/")), { force: true }).catch(() => undefined);
    }
    return resourceId ? this.getManagedDetail(actor, courseId) : this.getManaged(actor, courseId);
  }

  async openCover(actor: Actor, courseId: string, resourceId?: string) {
    const course = await this.database.query<{ status: string; created_by: string | null; cover_asset_key: string | null; cover_mime_type: string | null }>(
      "SELECT status,created_by,cover_asset_key,cover_mime_type FROM courses WHERE id=$1", [courseId]);
    if (!course.rows[0]) throw new NotFoundException("封面不存在");
    const manager = actor.roles.includes("admin") || (actor.roles.includes("teacher") && course.rows[0].created_by === actor.id);
    if (course.rows[0].status !== "published" && !manager) throw new NotFoundException("封面不存在");
    let key = course.rows[0].cover_asset_key;
    let mimeType = course.rows[0].cover_mime_type;
    const prefix = resourceId
      ? `admin/courses/${courseId}/resources/${resourceId}/covers/`
      : `admin/courses/${courseId}/covers/`;
    if (resourceId) {
      const resource = await this.database.query<{ cover_asset_key: string | null; cover_mime_type: string | null; status: string }>(
        "SELECT cover_asset_key,cover_mime_type,status FROM course_resources WHERE id=$1 AND course_id=$2", [resourceId, courseId]);
      if (!resource.rows[0] || (resource.rows[0].status !== "published" && !manager)) throw new NotFoundException("封面不存在");
      key = resource.rows[0].cover_asset_key;
      mimeType = resource.rows[0].cover_mime_type;
    }
    if (!key?.startsWith(prefix) || !/^[a-f0-9-]{36}-[a-f0-9-]{36}$/i.test(key.slice(prefix.length))
      || !coverMimeTypes.includes(mimeType as typeof coverMimeTypes[number])) throw new NotFoundException("封面不存在");
    const filePath = path.join(getEnvironment().uploadRoot, ...key.split("/"));
    const file = await stat(filePath).catch(() => undefined);
    if (!file?.isFile()) throw new NotFoundException("封面文件不存在");
    return { filePath, mimeType, sizeBytes: file.size };
  }

  async updateResourceMetadata(actor: Actor, courseId: string, resourceId: string, input: UpdateCourseResourceMetadataInput) {
    this.authService.requireAnyRole(actor, ADMIN_MANAGEMENT_ROLES);
    await this.database.transaction(async (client) => {
      const course = await client.query<{ status: string; created_by: string | null }>(
        "SELECT status,created_by FROM courses WHERE id=$1 FOR UPDATE", [courseId]);
      if (!course.rows[0]) throw new NotFoundException("课程不存在");
      if (!actor.roles.includes("admin") && course.rows[0].created_by !== actor.id) throw new ForbiddenException("只能管理自己创建的课程");
      if (!["draft", "rejected"].includes(course.rows[0].status)) throw new ConflictException("只有草稿或已驳回课程可以修改资料");
      const resource = await client.query<CourseResourceRow>(
        "SELECT id,course_id,lesson_id,title,summary,tags,cover_url,cover_asset_key,cover_mime_type,resource_type,storage_key,file_name,mime_type,file_size,status FROM course_resources WHERE id=$1 AND course_id=$2 FOR UPDATE",
        [resourceId, courseId]);
      if (!resource.rows[0]) throw new NotFoundException("课程资料不存在");
      await this.assertLessonBelongsToCourse(client, courseId, input.lessonId);
      const current = resource.rows[0];
      const replacingCover = input.coverUrl !== undefined && input.coverUrl !== current.cover_url;
      await client.query(`UPDATE course_resources SET title=$3,summary=$4,tags=$5::jsonb,cover_url=$6,lesson_id=$7,
        cover_asset_key=$8,cover_mime_type=$9,updated_at=CURRENT_TIMESTAMP
        WHERE id=$1 AND course_id=$2`, [resourceId, courseId, input.title ?? current.title,
        input.summary ?? current.summary ?? "", JSON.stringify(input.tags ?? current.tags ?? []),
        input.coverUrl === undefined ? current.cover_url : input.coverUrl,
        input.lessonId === undefined ? current.lesson_id : input.lessonId,
        replacingCover ? null : current.cover_asset_key, replacingCover ? null : current.cover_mime_type]);
    });
    return this.getManagedDetail(actor, courseId);
  }

  private async assertLessonBelongsToCourse(client: PoolClient, courseId: string, lessonId: string | null | undefined) {
    if (!lessonId) return;
    const lesson = await client.query("SELECT 1 FROM course_lessons WHERE id=$1 AND course_id=$2", [lessonId, courseId]);
    if (!lesson.rows[0]) throw new BadRequestException("所属课时不属于当前课程");
  }

  async openResource(actor: Actor, courseId: string, resourceId: string, mode: "preview" | "download" = "download") {
    const result = await this.database.query<CourseResourceRow>(`
      SELECT r.id,r.course_id,r.title,r.resource_type,r.storage_key,r.file_name,r.mime_type,r.file_size,r.status,
        c.status AS course_status,c.created_by,
        EXISTS(SELECT 1 FROM course_enrollments enrollment
          WHERE enrollment.course_id=c.id AND enrollment.user_id=$3 AND enrollment.status <> 'withdrawn') AS enrolled
      FROM course_resources r JOIN courses c ON c.id=r.course_id
      WHERE r.id=$1 AND r.course_id=$2
    `, [resourceId, courseId, actor.id]);
    const resource = result.rows[0];
    if (!resource || resource.status !== "published" || resource.course_status !== "published") throw new NotFoundException("课程资料不存在或尚未发布");
    const manager = actor.roles.includes("admin") || (actor.roles.includes("teacher") && resource.created_by === actor.id);
    // 加入课程后即可预览课件。课件内容的合规责任由上传的课程创建教师承担，
    // 平台记录每次预览、播放与下载。
    if (!manager && !resource.enrolled) throw new ForbiddenException("请先加入课程后再查看或下载课程资料");
    // 网页课件与视频只开放预览：学生端即使拿到下载地址也会被拒绝，
    // 课程创建教师和管理员仍可取回自己的原件。
    if (mode === "download" && !manager && !studentMayDownload(resource.resource_type, resource.mime_type)) {
      throw new ForbiddenException("该课件只提供在线预览，不提供原件下载");
    }
    const storageKey = resource.storage_key;
    const expectedPrefix = `admin/courses/${courseId}/`;
    if (!storageKey || !storageKey.startsWith(expectedPrefix) || !/^[a-f0-9-]{36}-[a-f0-9-]{36}$/i.test(storageKey.slice(expectedPrefix.length)) || !courseResourceMimeTypes.includes(resource.mime_type as typeof courseResourceMimeTypes[number])) {
      throw new NotFoundException("课程资料存储记录无效");
    }
    const filePath = path.join(getEnvironment().uploadRoot, ...storageKey.split("/"));
    const file = await stat(filePath).catch(() => undefined);
    if (!file?.isFile()) throw new NotFoundException("课程资料文件不存在");
    await this.database.query(
      "INSERT INTO course_resource_access_events (id,resource_id,user_id,access_kind) VALUES ($1,$2,$3,$4)",
      [`course-resource-access-${randomUUID()}`, resource.id, actor.id, mode === "download" ? "download" : (resource.resource_type === "video" ? "stream" : "preview")],
    );
    return {
      fileName: resource.file_name ?? resource.title,
      mimeType: resource.mime_type,
      resourceType: resource.resource_type,
      filePath,
      sizeBytes: file.size,
    };
  }

  async create(actor: Actor, input: CreateCourseInput) {
    this.authService.requireAnyRole(actor, ADMIN_MANAGEMENT_ROLES);
    const courseId = `course-${randomUUID()}`;
    await this.database.transaction(async (client) => {
      await client.query(`
        INSERT INTO courses (
          id, slug, title, summary, category, difficulty, cover_asset_key, cover_url,
          is_featured, status, created_by, estimated_minutes
        ) VALUES ($1, $1, $2, $3, $4, $5, $6, $7, $8, 'draft', $9, $10)
      `, [
        courseId, input.title, input.summary, input.category, input.difficulty,
        input.coverAssetKey ?? null, input.coverUrl ?? null, input.isFeatured, actor.id,
        input.lessons.reduce((sum, lesson) => sum + lesson.estimatedMinutes, 0),
      ]);
      await this.replaceLessons(client, courseId, input.lessons, true);
    });
    return this.getManaged(actor, courseId);
  }

  async update(actor: Actor, courseId: string, input: UpdateCourseInput) {
    this.authService.requireAnyRole(actor, ADMIN_MANAGEMENT_ROLES);
    const current = await this.getOwnedCourse(actor, courseId);
    if (!["draft", "rejected"].includes(current.status)) {
      throw new ConflictException("只有草稿或已驳回课程可以修改；已发布课程请通过后续版本功能更新");
    }
    const merged = {
      title: input.title ?? current.title,
      summary: input.summary ?? current.summary ?? "",
      category: input.category ?? current.category ?? "未分类",
      difficulty: input.difficulty ?? (current.difficulty as "beginner" | "intermediate" | "advanced") ?? "beginner",
      coverAssetKey: input.coverUrl !== undefined && input.coverUrl !== current.cover_url
        ? null : input.coverAssetKey === undefined ? current.cover_asset_key : input.coverAssetKey,
      coverUrl: input.coverUrl === undefined ? current.cover_url : input.coverUrl,
      isFeatured: input.isFeatured ?? current.is_featured,
    };
    await this.database.transaction(async (client) => {
      await client.query(`
        UPDATE courses SET title = $2, summary = $3, category = $4, difficulty = $5,
          cover_asset_key = $6, cover_mime_type = CASE WHEN $6::text IS NULL THEN NULL ELSE cover_mime_type END,
          cover_url = $7, is_featured = $8, status = 'draft', rejection_note = NULL,
          version_number = version_number + 1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
      `, [courseId, merged.title, merged.summary, merged.category, merged.difficulty, merged.coverAssetKey, merged.coverUrl, merged.isFeatured]);
      if (input.lessons) {
        await this.replaceLessons(client, courseId, input.lessons);
        await client.query(`
          UPDATE courses SET estimated_minutes = (
            SELECT COALESCE(SUM(estimated_minutes), 0)::int FROM course_lessons WHERE course_id = $1
          ) WHERE id = $1
        `, [courseId]);
      }
    });
    return this.getManaged(actor, courseId);
  }

  async submitReview(actor: Actor, courseId: string) {
    this.authService.requireAnyRole(actor, ADMIN_MANAGEMENT_ROLES);
    const course = await this.getOwnedCourse(actor, courseId);
    if (!["draft", "rejected"].includes(course.status)) throw new ConflictException("只有草稿或已驳回课程可以提交审核");
    if (Number(course.lesson_count ?? 0) < 1) throw new ConflictException("课程至少需要一个课时才能提交审核");
    const reviewId = `course-review-${randomUUID()}`;
    await this.database.transaction(async (client) => {
      await client.query(`
        INSERT INTO course_reviews (id, course_id, submitter_id, snapshot_version)
        VALUES ($1, $2, $3, $4)
      `, [reviewId, courseId, actor.id, course.version_number]);
      await client.query("UPDATE courses SET status = 'pending_review', updated_at = CURRENT_TIMESTAMP WHERE id = $1", [courseId]);
      await this.writeAudit(client, "course_review", reviewId, actor.id, "submit", "提交课程发布审核");
    });
    return this.getManaged(actor, courseId);
  }

  async listReviews(actor: Actor) {
    this.authService.requireAnyRole(actor, COURSE_REVIEW_ROLES);
    const result = await this.database.query<ReviewRow>(`
      SELECT r.id, r.course_id, c.title AS course_title, r.snapshot_version, r.status, r.note,
        submitter.display_name AS submitter_name, reviewer.display_name AS reviewer_name,
        r.submitted_at, r.decided_at
      FROM course_reviews r
      JOIN courses c ON c.id = r.course_id
      JOIN users submitter ON submitter.id = r.submitter_id
      LEFT JOIN users reviewer ON reviewer.id = r.reviewer_id
      ORDER BY CASE WHEN r.status = 'pending' THEN 0 ELSE 1 END, r.submitted_at DESC
    `);
    return { items: result.rows.map((row) => ({
      id: row.id,
      courseId: row.course_id,
      courseTitle: row.course_title,
      snapshotVersion: row.snapshot_version,
      status: row.status,
      note: row.note ?? "",
      submitterName: row.submitter_name,
      reviewerName: row.reviewer_name,
      submittedAt: row.submitted_at,
      decidedAt: row.decided_at,
    })) };
  }

  async decideReview(actor: Actor, reviewId: string, input: CourseReviewDecisionInput) {
    this.authService.requireAnyRole(actor, COURSE_REVIEW_ROLES);
    const changed = await this.database.transaction(async (client) => {
      const review = await client.query<ReviewRow & { submitter_id: string }>(`
        SELECT r.*, c.title AS course_title, '' AS submitter_name, NULL::text AS reviewer_name
        FROM course_reviews r JOIN courses c ON c.id = r.course_id
        WHERE r.id = $1 AND r.status = 'pending' FOR UPDATE
      `, [reviewId]);
      const row = review.rows[0];
      if (!row) return false;
      if (row.submitter_id === actor.id && !actor.roles.includes("admin")) {
        throw new ForbiddenException("课程提交人不能审核自己的课程");
      }
      await client.query(`
        UPDATE course_reviews SET status = $2, note = $3, reviewer_id = $4, decided_at = CURRENT_TIMESTAMP
        WHERE id = $1
      `, [reviewId, input.status, input.note, actor.id]);
      await client.query(`
        UPDATE courses SET status = $2, rejection_note = CASE WHEN $2 = 'rejected' THEN $3 ELSE NULL END,
          published_at = CASE WHEN $2 = 'published' THEN CURRENT_TIMESTAMP ELSE published_at END,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
      `, [row.course_id, input.status === "approved" ? "published" : "rejected", input.note]);
      await this.writeAudit(client, "course_review", reviewId, actor.id, input.status === "approved" ? "approve" : "reject", input.note);
      return true;
    });
    if (!changed) throw new NotFoundException("待审核课程不存在，或已被其他审核人员处理");
    return (await this.listReviews(actor)).items.find((item) => item.id === reviewId);
  }

  private async getManaged(actor: Actor, courseId: string) {
    const course = await this.getOwnedCourse(actor, courseId);
    return this.mapCourse(course);
  }

  private async getOwnedCourse(actor: Actor, courseId: string) {
    const result = await this.database.query<CourseRow>(`
      SELECT c.*, u.display_name AS creator_name, COUNT(DISTINCT l.id)::int AS lesson_count,
        0::int AS enrollment_count, 0::int AS progress_percent, NULL::text AS enrollment_status
      FROM courses c LEFT JOIN users u ON u.id = c.created_by LEFT JOIN course_lessons l ON l.course_id = c.id
      WHERE c.id = $1 GROUP BY c.id, u.display_name
    `, [courseId]);
    const course = result.rows[0];
    if (!course) throw new NotFoundException("课程不存在");
    if (!actor.roles.includes("admin") && course.created_by !== actor.id) throw new ForbiddenException("只能管理自己创建的课程");
    return course;
  }

  private async replaceLessons(client: PoolClient, courseId: string, lessons: CreateCourseInput["lessons"], creating = false) {
    const existing = await client.query<{ id: string }>("SELECT id FROM course_lessons WHERE course_id=$1", [courseId]);
    const existingIds = new Set(existing.rows.map((row) => row.id));
    const suppliedIds = lessons.map((lesson) => lesson.id).filter((id): id is string => !!id);
    if (new Set(suppliedIds).size !== suppliedIds.length || (!creating && suppliedIds.some((id) => !existingIds.has(id)))) {
      throw new BadRequestException("课时 ID 重复或不属于当前课程");
    }
    for (const [index, lesson] of lessons.entries()) {
      const values = [lesson.id ?? `lesson-${randomUUID()}`, courseId, lesson.title, lesson.summary,
        lesson.lessonType, index, lesson.estimatedMinutes, lesson.workflowId ?? null,
        JSON.stringify(lesson.modelConfigIds)];
      if (lesson.id && !creating) {
        await client.query(`UPDATE course_lessons SET title=$3,summary=$4,lesson_type=$5,sort_order=$6,
          estimated_minutes=$7,workflow_id=$8,model_config_ids=$9::jsonb,updated_at=CURRENT_TIMESTAMP
          WHERE id=$1 AND course_id=$2`, values);
      } else {
        await client.query(`INSERT INTO course_lessons (
          id,course_id,title,summary,lesson_type,sort_order,estimated_minutes,workflow_id,model_config_ids,status
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,'published')`, values);
      }
    }
    const removedIds = [...existingIds].filter((id) => !suppliedIds.includes(id));
    if (removedIds.length) await client.query("DELETE FROM course_lessons WHERE course_id=$1 AND id=ANY($2::text[])", [courseId, removedIds]);
  }

  private async writeAudit(client: PoolClient, targetType: string, targetId: string, reviewerId: string, action: string, reason: string) {
    await client.query(`
      INSERT INTO audit_records (id, target_type, target_id, reviewer_id, action, reason)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [`audit-${randomUUID()}`, targetType, targetId, reviewerId, action, reason]);
  }

  private mapCourse(row: CourseRow) {
    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      summary: row.summary ?? "",
      category: row.category ?? "未分类",
      difficulty: row.difficulty ?? "beginner",
      coverAssetKey: row.cover_asset_key,
      coverUrl: row.cover_url,
      coverImageUrl: row.cover_asset_key && row.cover_mime_type ? `/api/courses/${row.id}/cover` : null,
      isFeatured: row.is_featured,
      status: row.status,
      rejectionNote: row.rejection_note ?? "",
      versionNumber: Number(row.version_number),
      estimatedMinutes: Number(row.estimated_minutes),
      createdBy: row.created_by,
      creatorName: row.creator_name ?? "",
      lessonCount: Number(row.lesson_count ?? 0),
      enrollmentCount: Number(row.enrollment_count ?? 0),
      progressPercent: Number(row.progress_percent ?? 0),
      enrollmentStatus: row.enrollment_status ?? null,
      updatedAt: row.updated_at,
    };
  }
}

function resourceTypeForMime(mimeType: typeof courseResourceMimeTypes[number]) {
  if (mimeType === "application/pdf") return "pdf";
  if (mimeType.includes("wordprocessingml")) return "word";
  if (mimeType.includes("presentationml")) return "ppt";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("image/")) return "image";
  // 其余允许的类型都是网页课件源码（HTML/CSS/JS）。
  return "web";
}

/**
 * 学生端可以下载原件的课件类型。
 * 网页课件（HTML）与视频只提供在线预览：预览已经能完整呈现内容，再分发原件没有必要。
 * CSS/JS 源码无法在页面上单独渲染，属于"预览困难"的一类，保留下载。
 */
function studentMayDownload(resourceType: string, mimeType: string | null) {
  if (resourceType === "video") return false;
  if (resourceType === "web") return mimeType !== "text/html";
  return true;
}
