import { randomUUID } from "node:crypto";
import { ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { PoolClient, QueryResultRow } from "pg";
import { ADMIN_MANAGEMENT_ROLES, COURSE_REVIEW_ROLES } from "../../common/constants";
import { AuthService, type Actor } from "../auth/auth.service";
import { DatabaseService } from "../database/database.service";
import type {
  CourseReviewDecisionInput,
  CreateCourseInput,
  ProgressInput,
  UpdateCourseInput,
} from "./courses.contracts";

interface CourseRow extends QueryResultRow {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  category: string | null;
  difficulty: string | null;
  cover_asset_key: string | null;
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

@Injectable()
export class CoursesService {
  constructor(
    private readonly database: DatabaseService,
    private readonly authService: AuthService,
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
      this.database.query(`
        SELECT id, lesson_id AS "lessonId", title, resource_type AS "resourceType",
          storage_key AS "storageKey", external_url AS "externalUrl", file_name AS "fileName",
          mime_type AS "mimeType", sort_order AS "sortOrder"
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
      resources: resources.rows,
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

  async create(actor: Actor, input: CreateCourseInput) {
    this.authService.requireAnyRole(actor, ADMIN_MANAGEMENT_ROLES);
    const courseId = `course-${randomUUID()}`;
    await this.database.transaction(async (client) => {
      await client.query(`
        INSERT INTO courses (
          id, slug, title, summary, category, difficulty, cover_asset_key,
          is_featured, status, created_by, estimated_minutes
        ) VALUES ($1, $1, $2, $3, $4, $5, $6, $7, 'draft', $8, $9)
      `, [
        courseId, input.title, input.summary, input.category, input.difficulty,
        input.coverAssetKey ?? null, input.isFeatured, actor.id,
        input.lessons.reduce((sum, lesson) => sum + lesson.estimatedMinutes, 0),
      ]);
      await this.replaceLessons(client, courseId, input.lessons);
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
      coverAssetKey: input.coverAssetKey === undefined ? current.cover_asset_key : input.coverAssetKey,
      isFeatured: input.isFeatured ?? current.is_featured,
    };
    await this.database.transaction(async (client) => {
      await client.query(`
        UPDATE courses SET title = $2, summary = $3, category = $4, difficulty = $5,
          cover_asset_key = $6, is_featured = $7, status = 'draft', rejection_note = NULL,
          version_number = version_number + 1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
      `, [courseId, merged.title, merged.summary, merged.category, merged.difficulty, merged.coverAssetKey, merged.isFeatured]);
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

  private async replaceLessons(client: PoolClient, courseId: string, lessons: CreateCourseInput["lessons"]) {
    await client.query("DELETE FROM course_lessons WHERE course_id = $1", [courseId]);
    for (const [index, lesson] of lessons.entries()) {
      await client.query(`
        INSERT INTO course_lessons (
          id, course_id, title, summary, lesson_type, sort_order, estimated_minutes,
          workflow_id, model_config_ids, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, 'published')
      `, [
        lesson.id ?? `lesson-${randomUUID()}`, courseId, lesson.title, lesson.summary,
        lesson.lessonType, index, lesson.estimatedMinutes, lesson.workflowId ?? null,
        JSON.stringify(lesson.modelConfigIds),
      ]);
    }
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
