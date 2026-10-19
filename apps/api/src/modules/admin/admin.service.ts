import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from 'node:crypto';
import { ADMIN_MANAGEMENT_ROLES, PLATFORM_ADMIN_ROLES, REVIEW_ROLES } from "../../common/constants";
import { AuthService, type Actor } from "../auth/auth.service";
import { DatabaseService } from "../database/database.service";
import type { BulkQuotaInput, QuotaInput, ReportDecisionInput, ReviewDecisionInput } from "./admin.contracts";
import { AdminRepository } from "./admin.repository";

@Injectable()
export class AdminService {
  constructor(
    private readonly authService: AuthService,
    private readonly database: DatabaseService,
    private readonly repository: AdminRepository,
  ) {}

  async listManagedWorks(actor: Actor) {
    this.authService.requireAnyRole(actor, ['admin', 'operator']);
    const result = await this.database.query(`
      SELECT w.id,w.title,w.status,w.discipline,COALESCE(w.story_json->>'collection','community') AS collection,
        u.display_name AS author,w.updated_at AS "updatedAt",COUNT(a.id)::int AS "assetCount"
      FROM works w JOIN users u ON u.id=w.author_id
      LEFT JOIN work_assets a ON a.work_id=w.id
      GROUP BY w.id,u.display_name ORDER BY w.updated_at DESC
    `);
    return { items: result.rows };
  }

  async changeContentLifecycle(actor: Actor, kind: string, id: string, input: { action: 'archive' | 'restore'; reason: string; expectedStatus: string }) {
    if (!['course','work'].includes(kind)) throw new BadRequestException('不支持的内容类型');
    this.authService.requireAnyRole(actor, kind === 'course' ? ['admin'] : ['admin','operator']);
    // Only these fixed identifiers enter SQL. No user-provided table names.
    const table = kind === 'course' ? 'courses' : 'works';
    return this.database.transaction(async client => {
      const current = await client.query<{ id: string; status: string }>(`SELECT id,status FROM ${table} WHERE id=$1 FOR UPDATE`, [id]);
      const content = current.rows[0];
      if (!content) throw new NotFoundException('内容不存在');
      if (content.status !== input.expectedStatus) throw new ConflictException('内容状态已改变，请刷新列表后重新操作');
      if (input.action === 'restore' && content.status !== 'archived') throw new ConflictException('只能恢复回收站中的内容');
      if (input.action === 'archive' && content.status === 'archived') throw new ConflictException('内容已在回收站中');
      const status = input.action === 'archive' ? 'archived' : 'draft';
      // Restoring never silently republishes. Nothing is physically deleted.
      await client.query(`UPDATE ${table} SET status=$2,updated_at=CURRENT_TIMESTAMP WHERE id=$1`, [id, status]);
      if (kind === 'course' && input.action === 'archive') {
        await client.query(`UPDATE course_reviews SET status='rejected',reviewer_id=$2,note=$3,decided_at=CURRENT_TIMESTAMP WHERE course_id=$1 AND status='pending'`, [id, actor.id, `课程移入回收站，审核已撤回：${input.reason}`]);
      }
      await client.query(`INSERT INTO audit_records (id,target_type,target_id,reviewer_id,action,reason) VALUES ($1,$2,$3,$4,$5,$6)`,
        [randomUUID(), kind, id, actor.id, input.action, `${content.status} → ${status}；${input.reason}`]);
      return { id, status };
    });
  }

  async setWorkCollection(actor: Actor, workId: string, collection: "community" | "art-selection") {
    this.authService.requireAnyRole(actor, ["admin", "operator"]);
    const result = await this.database.transaction(client => this.repository.setWorkCollection(client, workId, actor.id, collection));
    if (!result) throw new NotFoundException("案例不存在");
    return result;
  }

  async getDashboard(actor: Actor) {
    this.authService.requireAnyRole(actor, ADMIN_MANAGEMENT_ROLES);
    const [users, reviews, stats] = await Promise.all([
      this.repository.listUsers(),
      this.repository.listReviews(),
      this.database.query<{ monthly_api_calls: number; today_api_calls: number; active_models: number; hourly_api_calls: Array<{ hour: string; calls: number }> }>(`
        SELECT
          (SELECT COUNT(*)::int FROM usage_records WHERE created_at >= date_trunc('month', CURRENT_TIMESTAMP) AND status = 'success') AS monthly_api_calls,
          (SELECT COUNT(*)::int FROM usage_records WHERE created_at >= date_trunc('day', CURRENT_TIMESTAMP) AND status = 'success') AS today_api_calls,
          (SELECT COUNT(*)::int FROM model_configs WHERE status = 'active') AS active_models,
          (
            SELECT COALESCE(json_agg(json_build_object('hour', slot.hour, 'calls', COALESCE(usage.calls, 0)) ORDER BY slot.hour), '[]'::json)
            FROM generate_series(date_trunc('hour', CURRENT_TIMESTAMP) - interval '7 hours', date_trunc('hour', CURRENT_TIMESTAMP), interval '1 hour') AS slot(hour)
            LEFT JOIN LATERAL (
              SELECT COUNT(*)::int AS calls
              FROM usage_records
              WHERE created_at >= slot.hour AND created_at < slot.hour + interval '1 hour' AND status = 'success'
            ) usage ON TRUE
          ) AS hourly_api_calls
      `),
    ]);
    const usage = stats.rows[0] ?? { monthly_api_calls: 0, today_api_calls: 0, active_models: 0, hourly_api_calls: [] };
    return {
      users: users.length,
      pendingReviews: reviews.filter((review) => review.status === "pending").length,
      quotaExhaustedUsers: users.filter((user) => user.quotaStatus === "exhausted").length,
      monthlyApiCalls: Number(usage.monthly_api_calls),
      todayApiCalls: Number(usage.today_api_calls),
      activeModels: Number(usage.active_models),
      hourlyApiCalls: usage.hourly_api_calls ?? [],
    };
  }

  async getUsers(actor: Actor, filters: { query?: string; status?: string }) {
    this.authService.requireAnyRole(actor, ADMIN_MANAGEMENT_ROLES);
    const keyword = filters.query?.toLowerCase();
    const items = (await this.repository.listUsers()).filter((user) => {
      const matchedKeyword = !keyword || `${user.name}${user.id}${user.department ?? ""}`.toLowerCase().includes(keyword);
      const matchedStatus = !filters.status || user.status === filters.status;
      return matchedKeyword && matchedStatus;
    });
    return { items };
  }

  async updateQuota(actor: Actor, userId: string, quota: QuotaInput) {
    this.authService.requireAnyRole(actor, PLATFORM_ADMIN_ROLES);
    if (!await this.repository.getUser(userId)) throw new NotFoundException("用户不存在");
    await this.repository.updateQuota(userId, quota, actor.id);
    return this.repository.getUser(userId);
  }

  async updateBulkQuota(actor: Actor, input: BulkQuotaInput) {
    this.authService.requireAnyRole(actor, PLATFORM_ADMIN_ROLES);
    const updated = await this.repository.updateQuotas(input.userIds, input.quota, actor.id);
    if (updated !== input.userIds.length) throw new NotFoundException("部分用户不存在，未执行批量额度更新");
    const items = await this.repository.listUsers();
    return { items: items.filter((user) => input.userIds.includes(user.id)) };
  }

  async updateAccountStatus(actor: Actor, userId: string, status: "active" | "suspended") {
    this.authService.requireAnyRole(actor, PLATFORM_ADMIN_ROLES);
    if (!await this.repository.getUser(userId)) throw new NotFoundException("用户不存在");
    await this.repository.updateAccountStatus(userId, status === "suspended" ? "disabled" : "active", actor.id);
    return this.repository.getUser(userId);
  }

  async getReviews(actor: Actor) {
    this.authService.requireAnyRole(actor, REVIEW_ROLES);
    return { items: await this.repository.listReviews() };
  }

  async decideReview(actor: Actor, reviewId: string, decision: ReviewDecisionInput) {
    this.authService.requireAnyRole(actor, REVIEW_ROLES);
    const changed = await this.database.transaction((client) => this.repository.decideReview(client, reviewId, actor.id, decision));
    if (!changed) throw new NotFoundException("待审核作品不存在，或已被其他审核人员处理");
    return (await this.repository.listReviews()).find((item) => item.id === reviewId);
  }

  async getReports(actor: Actor) {
    this.authService.requireAnyRole(actor, REVIEW_ROLES);
    return { items: await this.repository.listReports() };
  }

  async decideReport(actor: Actor, reportId: string, decision: ReportDecisionInput) {
    this.authService.requireAnyRole(actor, REVIEW_ROLES);
    const changed = await this.database.transaction((client) => this.repository.decideReport(client, reportId, actor.id, decision));
    if (!changed) throw new NotFoundException("待处理举报不存在，或已被其他审核人员处理");
    return (await this.repository.listReports()).find((item) => item.id === reportId);
  }
}
