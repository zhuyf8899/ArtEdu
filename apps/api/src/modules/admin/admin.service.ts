import { Injectable, NotFoundException } from "@nestjs/common";
import { ADMIN_MANAGEMENT_ROLES, PLATFORM_ADMIN_ROLES, REVIEW_ROLES } from "../../common/constants";
import { AuthService, type Actor } from "../auth/auth.service";
import { DatabaseService } from "../database/database.service";
import type { BulkQuotaInput, QuotaInput, ReviewDecisionInput } from "./admin.contracts";
import { AdminRepository } from "./admin.repository";

@Injectable()
export class AdminService {
  constructor(
    private readonly authService: AuthService,
    private readonly database: DatabaseService,
    private readonly repository: AdminRepository,
  ) {}

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
}
