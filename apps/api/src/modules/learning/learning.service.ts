import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { QueryResultRow } from "pg";
import type { Actor } from "../auth/auth.service";
import { DatabaseService } from "../database/database.service";
import type {
  CreateLearningNoteInput,
  CreateLearningTaskInput,
  UpdateLearningNoteInput,
  UpdateLearningTaskInput,
} from "./learning.contracts";

interface LearningCourseRow extends QueryResultRow {
  id: string;
  title: string;
  summary: string | null;
  category: string | null;
  difficulty: string | null;
  estimated_minutes: number;
  creator_name: string | null;
  lesson_count: number;
  completed_lessons: number;
  progress_percent: number;
  weekly_seconds: number;
  enrollment_status: string;
  last_studied_at: Date | null;
}

interface LearningTaskRow extends QueryResultRow {
  id: string;
  title: string;
  task_type: string;
  target_id: string | null;
  due_date: string | null;
  status: string;
  completed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

interface LearningNoteRow extends QueryResultRow {
  id: string;
  course_id: string | null;
  lesson_id: string | null;
  course_title: string | null;
  lesson_title: string | null;
  title: string;
  content: string;
  created_at: Date;
  updated_at: Date;
}

interface LearningWorkRow extends QueryResultRow {
  id: string;
  title: string;
  summary: string | null;
  discipline: string | null;
  status: string;
  author: string;
  preview_url: string | null;
  like_count: number;
  favorite_count: number;
  created_at: Date;
}

@Injectable()
export class LearningService {
  constructor(private readonly database: DatabaseService) {}

  async getDashboard(actor: Actor) {
    const [courses, tasks, notes, favorites, works, workflowRuns] = await Promise.all([
      this.listCourses(actor.id),
      this.listTasks(actor.id),
      this.listNotes(actor.id),
      this.listFavorites(actor.id),
      this.listWorks(actor.id),
      this.database.query(`
        SELECT r.id, r.status, r.current_step AS "currentStep", r.total_steps AS "totalSteps",
          r.updated_at AS "updatedAt", w.name AS "workflowName", w.category
        FROM workflow_runs r
        JOIN workflows w ON w.id = r.workflow_id
        WHERE r.user_id = $1
        ORDER BY r.updated_at DESC
        LIMIT 6
      `, [actor.id]),
    ]);

    const completedLessons = courses.reduce((sum, course) => sum + course.completedLessons, 0);
    const totalLessons = courses.reduce((sum, course) => sum + course.lessonCount, 0);
    const weeklySeconds = courses.reduce((sum, course) => sum + course.weeklySeconds, 0);
    const pendingTasks = tasks.filter((task) => task.status === "pending").length;

    return {
      profile: { id: actor.id, displayName: actor.displayName, roles: actor.roles },
      summary: {
        enrolledCourses: courses.length,
        completedLessons,
        totalLessons,
        weeklyMinutes: Math.round(weeklySeconds / 60),
        pendingTasks,
        completionPercent: totalLessons ? Math.round((completedLessons / totalLessons) * 100) : 0,
      },
      courses,
      tasks,
      notes,
      favorites,
      works,
      workflowRuns: workflowRuns.rows,
    };
  }

  async createTask(actor: Actor, input: CreateLearningTaskInput) {
    const result = await this.database.query<LearningTaskRow>(`
      INSERT INTO learning_tasks (id, user_id, title, task_type, target_id, due_date)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [`learning-task-${randomUUID()}`, actor.id, input.title, input.taskType, input.targetId ?? null, input.dueDate ?? null]);
    return this.mapTask(result.rows[0]);
  }

  async updateTask(actor: Actor, taskId: string, input: UpdateLearningTaskInput) {
    const result = await this.database.query<LearningTaskRow>(`
      UPDATE learning_tasks SET
        title = COALESCE($3, title),
        due_date = CASE WHEN $4::boolean THEN $5::date ELSE due_date END,
        status = COALESCE($6, status),
        completed_at = CASE
          WHEN $6 = 'completed' THEN COALESCE(completed_at, CURRENT_TIMESTAMP)
          WHEN $6 = 'pending' THEN NULL
          ELSE completed_at
        END,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND user_id = $2
      RETURNING *
    `, [taskId, actor.id, input.title ?? null, input.dueDate !== undefined, input.dueDate ?? null, input.status ?? null]);
    if (!result.rows[0]) throw new NotFoundException("学习任务不存在");
    return this.mapTask(result.rows[0]);
  }

  async deleteTask(actor: Actor, taskId: string) {
    const result = await this.database.query("DELETE FROM learning_tasks WHERE id = $1 AND user_id = $2 RETURNING id", [taskId, actor.id]);
    if (!result.rows[0]) throw new NotFoundException("学习任务不存在");
    return { id: taskId, deleted: true };
  }

  async createNote(actor: Actor, input: CreateLearningNoteInput) {
    await this.validateNoteTargets(input.courseId, input.lessonId);
    const result = await this.database.query<LearningNoteRow>(`
      INSERT INTO learning_notes (id, user_id, course_id, lesson_id, title, content)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *, NULL::text AS course_title, NULL::text AS lesson_title
    `, [`learning-note-${randomUUID()}`, actor.id, input.courseId ?? null, input.lessonId ?? null, input.title, input.content]);
    return this.mapNote(result.rows[0]);
  }

  async updateNote(actor: Actor, noteId: string, input: UpdateLearningNoteInput) {
    const result = await this.database.query<LearningNoteRow>(`
      UPDATE learning_notes SET title = COALESCE($3, title), content = COALESCE($4, content), updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND user_id = $2
      RETURNING *, NULL::text AS course_title, NULL::text AS lesson_title
    `, [noteId, actor.id, input.title ?? null, input.content ?? null]);
    if (!result.rows[0]) throw new NotFoundException("学习笔记不存在");
    return this.mapNote(result.rows[0]);
  }

  async deleteNote(actor: Actor, noteId: string) {
    const result = await this.database.query("DELETE FROM learning_notes WHERE id = $1 AND user_id = $2 RETURNING id", [noteId, actor.id]);
    if (!result.rows[0]) throw new NotFoundException("学习笔记不存在");
    return { id: noteId, deleted: true };
  }

  private async listCourses(userId: string) {
    const result = await this.database.query<LearningCourseRow>(`
      SELECT c.id, c.title, c.summary, c.category, c.difficulty, c.estimated_minutes,
        creator.display_name AS creator_name, e.status AS enrollment_status,
        COUNT(DISTINCT l.id)::int AS lesson_count,
        COUNT(DISTINCT l.id) FILTER (WHERE p.progress_percent = 100)::int AS completed_lessons,
        COALESCE(ROUND(AVG(COALESCE(p.progress_percent, 0))), 0)::int AS progress_percent,
        COALESCE(SUM(p.watched_seconds) FILTER (WHERE p.updated_at >= CURRENT_TIMESTAMP - INTERVAL '7 days'), 0)::int AS weekly_seconds,
        MAX(p.updated_at) AS last_studied_at
      FROM course_enrollments e
      JOIN courses c ON c.id = e.course_id
      LEFT JOIN users creator ON creator.id = c.created_by
      LEFT JOIN course_lessons l ON l.course_id = c.id AND l.status = 'published'
      LEFT JOIN learning_progress p ON p.lesson_id = l.id AND p.user_id = e.user_id
      WHERE e.user_id = $1 AND e.status <> 'withdrawn' AND c.status = 'published'
      GROUP BY c.id, creator.display_name, e.status, e.updated_at
      ORDER BY MAX(p.updated_at) DESC NULLS LAST, e.updated_at DESC
    `, [userId]);
    return result.rows.map((row) => ({
      id: row.id,
      title: row.title,
      summary: row.summary ?? "",
      category: row.category ?? "未分类",
      difficulty: row.difficulty ?? "beginner",
      estimatedMinutes: Number(row.estimated_minutes ?? 0),
      creatorName: row.creator_name ?? "ArtEdu 教学团队",
      lessonCount: Number(row.lesson_count ?? 0),
      completedLessons: Number(row.completed_lessons ?? 0),
      progressPercent: Number(row.progress_percent ?? 0),
      weeklySeconds: Number(row.weekly_seconds ?? 0),
      enrollmentStatus: row.enrollment_status,
      lastStudiedAt: row.last_studied_at,
    }));
  }

  private async listTasks(userId: string) {
    const result = await this.database.query<LearningTaskRow>(`
      SELECT * FROM learning_tasks
      WHERE user_id = $1
      ORDER BY CASE WHEN status = 'pending' THEN 0 ELSE 1 END, due_date NULLS LAST, sort_order, created_at DESC
    `, [userId]);
    return result.rows.map((row) => this.mapTask(row));
  }

  private async listNotes(userId: string) {
    const result = await this.database.query<LearningNoteRow>(`
      SELECT n.*, c.title AS course_title, l.title AS lesson_title
      FROM learning_notes n
      LEFT JOIN courses c ON c.id = n.course_id
      LEFT JOIN course_lessons l ON l.id = n.lesson_id
      WHERE n.user_id = $1
      ORDER BY n.updated_at DESC
    `, [userId]);
    return result.rows.map((row) => this.mapNote(row));
  }

  private async listFavorites(userId: string) {
    const result = await this.database.query<LearningWorkRow>(`
      SELECT w.id, w.title, w.summary, w.discipline, w.status, author.display_name AS author,
        MIN(assets.external_url) FILTER (WHERE assets.asset_type = 'image') AS preview_url,
        COUNT(DISTINCT likes.user_id)::int AS like_count,
        COUNT(DISTINCT all_favorites.user_id)::int AS favorite_count,
        w.created_at
      FROM work_favorites mine
      JOIN works w ON w.id = mine.work_id AND w.status = 'approved'
      JOIN users author ON author.id = w.author_id
      LEFT JOIN work_assets assets ON assets.work_id = w.id
      LEFT JOIN work_likes likes ON likes.work_id = w.id
      LEFT JOIN work_favorites all_favorites ON all_favorites.work_id = w.id
      WHERE mine.user_id = $1
      GROUP BY w.id, author.display_name, mine.created_at
      ORDER BY mine.created_at DESC
    `, [userId]);
    return result.rows.map((row) => this.mapWork(row));
  }

  private async listWorks(userId: string) {
    const result = await this.database.query<LearningWorkRow>(`
      SELECT w.id, w.title, w.summary, w.discipline, w.status, author.display_name AS author,
        MIN(assets.external_url) FILTER (WHERE assets.asset_type = 'image') AS preview_url,
        COUNT(DISTINCT likes.user_id)::int AS like_count,
        COUNT(DISTINCT favorites.user_id)::int AS favorite_count,
        w.created_at
      FROM works w
      JOIN users author ON author.id = w.author_id
      LEFT JOIN work_assets assets ON assets.work_id = w.id
      LEFT JOIN work_likes likes ON likes.work_id = w.id
      LEFT JOIN work_favorites favorites ON favorites.work_id = w.id
      WHERE w.author_id = $1
      GROUP BY w.id, author.display_name
      ORDER BY w.created_at DESC
    `, [userId]);
    return result.rows.map((row) => this.mapWork(row));
  }

  private async validateNoteTargets(courseId?: string, lessonId?: string) {
    if (courseId) {
      const course = await this.database.query("SELECT id FROM courses WHERE id = $1 AND status = 'published'", [courseId]);
      if (!course.rows[0]) throw new BadRequestException("关联课程不存在或尚未发布");
    }
    if (lessonId) {
      const lesson = await this.database.query("SELECT id, course_id FROM course_lessons WHERE id = $1 AND status = 'published'", [lessonId]);
      if (!lesson.rows[0]) throw new BadRequestException("关联课时不存在或尚未发布");
      if (courseId && lesson.rows[0].course_id !== courseId) throw new BadRequestException("关联课时不属于所选课程");
    }
  }

  private mapTask(row: LearningTaskRow) {
    return {
      id: row.id,
      title: row.title,
      taskType: row.task_type,
      targetId: row.target_id,
      dueDate: row.due_date,
      status: row.status,
      completedAt: row.completed_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapNote(row: LearningNoteRow) {
    return {
      id: row.id,
      courseId: row.course_id,
      lessonId: row.lesson_id,
      courseTitle: row.course_title,
      lessonTitle: row.lesson_title,
      title: row.title,
      content: row.content,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapWork(row: LearningWorkRow) {
    return {
      id: row.id,
      title: row.title,
      summary: row.summary ?? "",
      discipline: row.discipline ?? "未分类",
      status: row.status,
      author: row.author,
      previewUrl: row.preview_url,
      likeCount: Number(row.like_count ?? 0),
      favoriteCount: Number(row.favorite_count ?? 0),
      createdAt: row.created_at,
    };
  }
}
