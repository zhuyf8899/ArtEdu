import { Injectable } from "@nestjs/common";
import { MANAGED_QUOTA_CAPABILITY } from "../../common/constants";
import { getEnvironment } from "../../common/environment";
import { DatabaseService } from "../database/database.service";
import type { Actor } from "../auth/auth.service";
import { ModelRegistry } from "../generation/model-registry";
import { buildPortalSearchPatterns, type PortalSearchQuery } from "./portal.contracts";

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

interface QuotaRow {
  daily_limit: number | null;
  monthly_limit: number | null;
  concurrent_limit: number | null;
  daily_used: number;
  monthly_used: number;
  in_flight: number;
}

interface ModelRow {
  id: string;
  display_name: string;
  model_identifier: string;
  capabilities_json: unknown;
}

interface SearchRow {
  id: string;
  title: string;
  summary: string | null;
  category: string | null;
  author: string | null;
  metadata: string | null;
  tags: string[] | null;
  updated_at: Date;
}

@Injectable()
export class PortalService {
  constructor(private readonly database: DatabaseService, private readonly modelRegistry: ModelRegistry) {}

  async getHome(actor: Actor) {
    const [courses, workflows, works, quotaResult, models] = await Promise.all([
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
      // 该快照仅用于创作前提示；创建任务时 GenerationService 会在事务内再次校验额度。
      this.database.query<QuotaRow>(`
        WITH limits AS (
          SELECT
            MAX(limit_value) FILTER (WHERE period_type = 'daily') AS daily_limit,
            MAX(limit_value) FILTER (WHERE period_type = 'monthly') AS monthly_limit,
            MAX(limit_value) FILTER (WHERE period_type = 'concurrent') AS concurrent_limit
          FROM user_usage_limits
          WHERE user_id = $1 AND capability = $2 AND enabled = TRUE
        ), usage AS (
          SELECT
            COUNT(*) FILTER (WHERE created_at >= date_trunc('day', NOW()) AND status IN ('queued', 'running', 'succeeded'))::int AS daily_used,
            COUNT(*) FILTER (WHERE created_at >= date_trunc('month', NOW()) AND status IN ('queued', 'running', 'succeeded'))::int AS monthly_used,
            COUNT(*) FILTER (WHERE status IN ('queued', 'running'))::int AS in_flight
          FROM generation_jobs
          WHERE user_id = $1
        )
        SELECT limits.daily_limit, limits.monthly_limit, limits.concurrent_limit,
          usage.daily_used, usage.monthly_used, usage.in_flight
        FROM limits CROSS JOIN usage
      `, [actor.id, MANAGED_QUOTA_CAPABILITY]),
      this.database.query<ModelRow>(`
        SELECT id, display_name, model_identifier, capabilities_json
        FROM model_configs
        WHERE status = 'active'
        ORDER BY display_name
      `),
    ]);

    const quota = quotaResult.rows[0] ?? {
      daily_limit: null, monthly_limit: null, concurrent_limit: null,
      daily_used: 0, monthly_used: 0, in_flight: 0,
    };

    const configuredModels = new Map(this.modelRegistry.listConfigured().map((model) => [model.id, model]));
    // 内部通道（如平台内置图像生成）只服务后端按能力路由，不进入前台的模型选择列表：
    // 用户不需要、也不应该看到它，图像类任务由服务端自动路由过去。
    const executableModels = models.rows.filter((row) => {
      const configured = configuredModels.get(row.id);
      return Boolean(configured) && configured?.internal !== true;
    });

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
      creation: {
        enabled: getEnvironment().modelExecutionEnabled && executableModels.length > 0,
        models: executableModels.map((row) => ({
          id: row.id,
          name: row.display_name,
          identifier: row.model_identifier,
          capabilities: configuredModels.get(row.id)?.capabilities ?? (Array.isArray(row.capabilities_json) ? row.capabilities_json : []),
        })),
        quota: {
          dailyLimit: quota.daily_limit === null ? null : Number(quota.daily_limit),
          dailyUsed: Number(quota.daily_used),
          monthlyLimit: quota.monthly_limit === null ? null : Number(quota.monthly_limit),
          monthlyUsed: Number(quota.monthly_used),
          concurrentLimit: quota.concurrent_limit === null ? null : Number(quota.concurrent_limit),
          inFlight: Number(quota.in_flight),
        },
      },
    };
  }

  async search(_actor: Actor, query: PortalSearchQuery) {
    const patterns = buildPortalSearchPatterns(query.query);
    const tag = query.tag ?? null;
    const limit = 24;
    const include = (type: PortalSearchQuery["type"]) => query.type === "all" || query.type === type;

    const [courses, workflows, works] = await Promise.all([
      include("course") ? this.database.query<SearchRow>(`
        SELECT c.id, c.title, c.summary, c.category, creator.display_name AS author,
          c.difficulty AS metadata,
          ARRAY_REMOVE(ARRAY_AGG(DISTINCT tag.name), NULL) AS tags,
          c.updated_at
        FROM courses c
        LEFT JOIN users creator ON creator.id = c.created_by
        LEFT JOIN course_tags relation ON relation.course_id = c.id
        LEFT JOIN tags tag ON tag.id = relation.tag_id
        WHERE c.status = 'published'
          AND (
            c.title ILIKE ANY($1::text[]) OR COALESCE(c.summary, '') ILIKE ANY($1::text[]) OR
            COALESCE(c.category, '') ILIKE ANY($1::text[]) OR COALESCE(creator.display_name, '') ILIKE ANY($1::text[]) OR
            EXISTS (
              SELECT 1 FROM course_tags search_relation
              JOIN tags search_tag ON search_tag.id = search_relation.tag_id
              WHERE search_relation.course_id = c.id AND search_tag.name ILIKE ANY($1::text[])
            )
          )
          AND ($2::text IS NULL OR c.category = $2 OR c.difficulty = $2 OR EXISTS (
            SELECT 1 FROM course_tags filter_relation
            JOIN tags filter_tag ON filter_tag.id = filter_relation.tag_id
            WHERE filter_relation.course_id = c.id AND filter_tag.name = $2
          ))
        GROUP BY c.id, creator.display_name
        ORDER BY c.is_featured DESC, c.featured_rank NULLS LAST, c.updated_at DESC
        LIMIT $3
      `, [patterns, tag, limit]) : Promise.resolve({ rows: [] as SearchRow[] }),
      include("workflow") ? this.database.query<SearchRow>(`
        SELECT workflow.id, workflow.name AS title, workflow.description AS summary,
          workflow.category, creator.display_name AS author, workflow.entry_type AS metadata,
          ARRAY_REMOVE(ARRAY_AGG(DISTINCT tag.name), NULL) AS tags,
          workflow.updated_at
        FROM workflows workflow
        LEFT JOIN users creator ON creator.id = workflow.created_by
        LEFT JOIN workflow_tags relation ON relation.workflow_id = workflow.id
        LEFT JOIN tags tag ON tag.id = relation.tag_id
        WHERE workflow.status = 'published'
          AND (
            workflow.name ILIKE ANY($1::text[]) OR COALESCE(workflow.description, '') ILIKE ANY($1::text[]) OR
            COALESCE(workflow.category, '') ILIKE ANY($1::text[]) OR COALESCE(creator.display_name, '') ILIKE ANY($1::text[]) OR
            EXISTS (
              SELECT 1 FROM workflow_tags search_relation
              JOIN tags search_tag ON search_tag.id = search_relation.tag_id
              WHERE search_relation.workflow_id = workflow.id AND search_tag.name ILIKE ANY($1::text[])
            )
          )
          AND ($2::text IS NULL OR workflow.category = $2 OR workflow.entry_type = $2 OR EXISTS (
            SELECT 1 FROM workflow_tags filter_relation
            JOIN tags filter_tag ON filter_tag.id = filter_relation.tag_id
            WHERE filter_relation.workflow_id = workflow.id AND filter_tag.name = $2
          ))
        GROUP BY workflow.id, creator.display_name
        ORDER BY workflow.is_featured DESC, workflow.featured_rank NULLS LAST, workflow.updated_at DESC
        LIMIT $3
      `, [patterns, tag, limit]) : Promise.resolve({ rows: [] as SearchRow[] }),
      include("work") ? this.database.query<SearchRow>(`
        SELECT work.id, work.title, work.summary, work.discipline AS category,
          author.display_name AS author, NULL::text AS metadata,
          ARRAY_REMOVE(ARRAY_AGG(DISTINCT tag.name), NULL) AS tags,
          work.updated_at
        FROM works work
        JOIN users author ON author.id = work.author_id
        LEFT JOIN work_tags relation ON relation.work_id = work.id
        LEFT JOIN tags tag ON tag.id = relation.tag_id
        WHERE work.status = 'approved'
          AND (
            work.title ILIKE ANY($1::text[]) OR COALESCE(work.summary, '') ILIKE ANY($1::text[]) OR
            COALESCE(work.discipline, '') ILIKE ANY($1::text[]) OR author.display_name ILIKE ANY($1::text[]) OR
            EXISTS (
              SELECT 1 FROM work_tags search_relation
              JOIN tags search_tag ON search_tag.id = search_relation.tag_id
              WHERE search_relation.work_id = work.id AND search_tag.name ILIKE ANY($1::text[])
            )
          )
          AND ($2::text IS NULL OR work.discipline = $2 OR author.display_name = $2 OR EXISTS (
            SELECT 1 FROM work_tags filter_relation
            JOIN tags filter_tag ON filter_tag.id = filter_relation.tag_id
            WHERE filter_relation.work_id = work.id AND filter_tag.name = $2
          ))
        GROUP BY work.id, author.display_name
        ORDER BY work.is_featured DESC, work.featured_rank NULLS LAST, work.updated_at DESC
        LIMIT $3
      `, [patterns, tag, limit]) : Promise.resolve({ rows: [] as SearchRow[] }),
    ]);

    const items = [
      ...courses.rows.map((row) => this.mapSearchResult("course", row)),
      ...workflows.rows.map((row) => this.mapSearchResult("workflow", row)),
      ...works.rows.map((row) => this.mapSearchResult("work", row)),
    ].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    const counts = {
      all: items.length,
      course: courses.rows.length,
      workflow: workflows.rows.length,
      work: works.rows.length,
    };
    const availableTags = [...new Set(items.flatMap((item) => item.tags))].sort((left, right) => left.localeCompare(right, "zh-CN"));

    return { query: query.query, type: query.type, tag, counts, availableTags, items };
  }

  private mapSearchResult(type: "course" | "workflow" | "work", row: SearchRow) {
    const typeLabel = { course: "教学资源", workflow: "工作流", work: "案例社区" }[type];
    const metadataLabel = type === "course"
      ? ({ beginner: "入门", intermediate: "进阶", advanced: "高级" }[row.metadata ?? ""] ?? row.metadata)
      : type === "workflow"
        ? ({ chat: "对话式", workbench: "工作台", external_tool: "外部工具" }[row.metadata ?? ""] ?? row.metadata)
        : null;
    const tags = [typeLabel, row.category, metadataLabel, ...(row.tags ?? [])].filter((value): value is string => Boolean(value));
    return {
      id: row.id,
      type,
      typeLabel,
      title: row.title,
      summary: row.summary ?? "",
      category: row.category ?? "未分类",
      author: row.author ?? "ArtEdu 教学团队",
      tags: [...new Set(tags)],
      route: { course: "/learning", workflow: "/studio", work: "/community" }[type],
      updatedAt: row.updated_at.toISOString(),
    };
  }
}
