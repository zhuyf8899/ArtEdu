import { Inject, Injectable } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";
import type { Actor } from "../auth/auth.service";

interface CourseRow {
  id: string;
  title: string;
  summary: string | null;
  category: string | null;
  lesson_count: number;
  progress_percent: number | null;
}

interface WorkflowRow {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  entry_type: "chat" | "workbench" | "external_tool";
}

interface WorkRow {
  id: string;
  title: string;
  summary: string | null;
  discipline: string | null;
  author: string;
}

@Injectable()
export class PortalService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async getHome(actor: Actor) {
    const [courses, workflows, works] = await Promise.all([
      this.database.query<CourseRow>(`
        SELECT
          c.id,
          c.title,
          c.summary,
          c.category,
          COUNT(DISTINCT lesson.id)::int AS lesson_count,
          COALESCE(MAX(progress.progress_percent), 0)::int AS progress_percent
        FROM courses c
        LEFT JOIN course_lessons lesson ON lesson.course_id = c.id AND lesson.status = 'published'
        LEFT JOIN learning_progress progress ON progress.lesson_id = lesson.id AND progress.user_id = $1
        WHERE c.status = 'published'
        GROUP BY c.id
        ORDER BY c.is_featured DESC, c.featured_rank NULLS LAST, c.created_at DESC
        LIMIT 6
      `, [actor.id]),
      this.database.query<WorkflowRow>(`
        SELECT id, name, description, category, entry_type
        FROM workflows
        WHERE status = 'published'
        ORDER BY is_featured DESC, featured_rank NULLS LAST, created_at DESC
        LIMIT 6
      `),
      this.database.query<WorkRow>(`
        SELECT w.id, w.title, w.summary, w.discipline, u.display_name AS author
        FROM works w
        JOIN users u ON u.id = w.author_id
        WHERE w.status = 'approved'
        ORDER BY w.is_featured DESC, w.featured_rank NULLS LAST, w.published_at DESC
        LIMIT 8
      `),
    ]);

    return {
      profile: { id: actor.id, displayName: actor.displayName, roles: actor.roles },
      courses: courses.rows.map((row) => ({
        id: row.id,
        title: row.title,
        summary: row.summary ?? "",
        category: row.category ?? "未分类",
        lessonCount: Number(row.lesson_count),
        progressPercent: Number(row.progress_percent ?? 0),
      })),
      workflows: workflows.rows.map((row) => ({
        id: row.id,
        name: row.name,
        description: row.description ?? "",
        category: row.category ?? "未分类",
        entryType: row.entry_type,
      })),
      works: works.rows.map((row) => ({
        id: row.id,
        title: row.title,
        summary: row.summary ?? "",
        discipline: row.discipline ?? "案例作品",
        author: row.author,
      })),
    };
  }
}
