import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { MANAGED_QUOTA_CAPABILITY } from "../../common/constants";
import { DatabaseService } from "../database/database.service";
import type { QuotaInput, ReviewDecisionInput } from "./admin.contracts";

export interface AdminUser {
  id: string;
  name: string;
  initials: string;
  department: string | null;
  identity: string;
  accountStatus: "active" | "disabled" | "pending";
  quotaStatus: "normal" | "exhausted";
  status: "active" | "limited" | "suspended" | "pending";
  dailyLimit: number;
  monthlyLimit: number;
  monthlyUsed: number;
  concurrentLimit: number;
  works: number;
  lastActive: string;
}

export interface AdminReview {
  id: string;
  title: string;
  author: string;
  department: string | null;
  kind: string;
  model: string;
  submittedAt: string;
  machineStatus: string;
  prompt: string;
  assets: number;
  status: "pending" | "approved" | "rejected";
}

interface UserRow {
  id: string;
  name: string;
  department: string | null;
  roles: string[] | null;
  account_status: "active" | "disabled" | "pending";
  daily_limit: number | null;
  monthly_limit: number | null;
  concurrent_limit: number | null;
  monthly_used: number | null;
  active_jobs: number | null;
  works: number | null;
  last_active: Date;
}

interface ReviewRow {
  id: string;
  title: string;
  author: string;
  department: string | null;
  kind: string | null;
  model: string | null;
  submitted_at: Date;
  machine_status: string | null;
  prompt: string | null;
  assets: number | null;
  status: AdminReview["status"];
}

@Injectable()
export class AdminRepository {
  constructor(private readonly database: DatabaseService) {}

  async listUsers(): Promise<AdminUser[]> {
    const result = await this.database.query<UserRow>(`
      WITH role_values AS (
        SELECT ur.user_id, array_agg(r.name ORDER BY r.name) AS roles
        FROM user_roles ur
        JOIN roles r ON r.id = ur.role_id
        GROUP BY ur.user_id
      ), quota_values AS (
        SELECT
          user_id,
          MAX(limit_value) FILTER (WHERE capability = $1 AND period_type = 'daily') AS daily_limit,
          MAX(limit_value) FILTER (WHERE capability = $1 AND period_type = 'monthly') AS monthly_limit,
          MAX(limit_value) FILTER (WHERE capability = $1 AND period_type = 'concurrent') AS concurrent_limit
        FROM user_usage_limits
        GROUP BY user_id
      ), job_values AS (
        SELECT
          user_id,
          COUNT(*) FILTER (
            WHERE created_at >= date_trunc('month', NOW())
              AND status IN ('queued', 'running', 'succeeded')
          ) AS monthly_used,
          COUNT(*) FILTER (WHERE status IN ('queued', 'running')) AS active_jobs
        FROM generation_jobs
        GROUP BY user_id
      ), work_values AS (
        SELECT author_id, COUNT(*) AS works
        FROM works
        GROUP BY author_id
      )
      SELECT
        u.id,
        u.display_name AS name,
        d.name AS department,
        rv.roles,
        u.status AS account_status,
        qv.daily_limit,
        qv.monthly_limit,
        qv.concurrent_limit,
        jv.monthly_used,
        jv.active_jobs,
        wv.works,
        u.updated_at AS last_active
      FROM users u
      LEFT JOIN departments d ON d.id = u.department_id
      LEFT JOIN role_values rv ON rv.user_id = u.id
      LEFT JOIN quota_values qv ON qv.user_id = u.id
      LEFT JOIN job_values jv ON jv.user_id = u.id
      LEFT JOIN work_values wv ON wv.author_id = u.id
      ORDER BY u.created_at DESC
    `, [MANAGED_QUOTA_CAPABILITY]);

    return result.rows.map((row) => this.mapUser(row));
  }

  async getUser(userId: string): Promise<AdminUser | undefined> {
    return (await this.listUsers()).find((user) => user.id === userId);
  }

  async updateQuota(userId: string, quota: QuotaInput, operatorId: string): Promise<void> {
    await this.database.transaction(async (client) => {
      const existing = await client.query("SELECT id FROM users WHERE id = $1 FOR UPDATE", [userId]);
      if (existing.rowCount === 0) return;

      const values: Array<["daily" | "monthly" | "concurrent", number]> = [
        ["daily", quota.dailyLimit],
        ["monthly", quota.monthlyLimit],
        ["concurrent", quota.concurrentLimit],
      ];
      for (const [periodType, limitValue] of values) {
        await client.query(`
          INSERT INTO user_usage_limits (id, user_id, capability, period_type, limit_value)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (user_id, capability, period_type)
          DO UPDATE SET limit_value = EXCLUDED.limit_value, updated_at = CURRENT_TIMESTAMP
        `, [randomUUID(), userId, MANAGED_QUOTA_CAPABILITY, periodType, limitValue]);
      }
      await client.query(`
        INSERT INTO audit_records (id, target_type, target_id, reviewer_id, action, reason)
        VALUES ($1, 'user_usage_limit', $2, $3, 'update_quota', $4)
      `, [
        randomUUID(),
        userId,
        operatorId,
        `daily=${quota.dailyLimit}; monthly=${quota.monthlyLimit}; concurrent=${quota.concurrentLimit}`,
      ]);
    });
  }

  async updateAccountStatus(userId: string, status: "active" | "disabled", operatorId: string): Promise<void> {
    await this.database.transaction(async (client) => {
      await client.query(
        "UPDATE users SET status = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1",
        [userId, status],
      );
      await client.query(`
        INSERT INTO audit_records (id, target_type, target_id, reviewer_id, action, reason)
        VALUES ($1, 'user', $2, $3, $4, NULL)
      `, [randomUUID(), userId, operatorId, status === "active" ? "enable" : "disable"]);
    });
  }

  async listReviews(): Promise<AdminReview[]> {
    const result = await this.database.query<ReviewRow>(`
      SELECT
        w.id,
        w.title,
        author.display_name AS author,
        department.name AS department,
        COALESCE(w.discipline, '案例投稿') AS kind,
        model.display_name AS model,
        w.created_at AS submitted_at,
        moderation.machine_status,
        job.prompt,
        asset_counts.assets,
        w.status
      FROM works w
      JOIN users author ON author.id = w.author_id
      LEFT JOIN departments department ON department.id = author.department_id
      LEFT JOIN LATERAL (
        SELECT gj.model_config_id, gj.prompt
        FROM work_generation_jobs wgj
        JOIN generation_jobs gj ON gj.id = wgj.generation_job_id
        WHERE wgj.work_id = w.id
        ORDER BY gj.created_at DESC
        LIMIT 1
      ) job ON TRUE
      LEFT JOIN model_configs model ON model.id = job.model_config_id
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS assets FROM work_assets wa WHERE wa.work_id = w.id
      ) asset_counts ON TRUE
      LEFT JOIN LATERAL (
        SELECT CASE
          WHEN BOOL_OR(amr.result = 'rejected') THEN '机器预审拒绝'
          WHEN BOOL_OR(amr.result = 'manual_review') THEN '需要人工复核'
          WHEN BOOL_OR(amr.result = 'approved') THEN '机器预审通过'
          ELSE '待机器预审'
        END AS machine_status
        FROM work_assets wa
        LEFT JOIN asset_moderation_records amr
          ON amr.asset_type = 'work_asset' AND amr.asset_id = wa.id
        WHERE wa.work_id = w.id
      ) moderation ON TRUE
      WHERE w.status IN ('pending', 'approved', 'rejected')
      ORDER BY CASE w.status WHEN 'pending' THEN 0 ELSE 1 END, w.created_at DESC
    `);

    return result.rows.map((row) => ({
      id: row.id,
      title: row.title,
      author: row.author,
      department: row.department,
      kind: row.kind ?? "案例投稿",
      model: row.model ?? "未关联模型",
      submittedAt: row.submitted_at.toISOString(),
      machineStatus: row.machine_status ?? "待机器预审",
      prompt: row.prompt ?? "未记录生成提示词",
      assets: Number(row.assets ?? 0),
      status: row.status,
    }));
  }

  async decideReview(
    client: PoolClient,
    workId: string,
    reviewerId: string,
    decision: ReviewDecisionInput,
  ): Promise<boolean> {
    const update = await client.query(`
      UPDATE works
      SET
        status = $2,
        published_at = CASE WHEN $2 = 'approved' THEN CURRENT_TIMESTAMP ELSE NULL END,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND status = 'pending'
      RETURNING id
    `, [workId, decision.status]);
    if (update.rowCount === 0) return false;

    await client.query(
      "UPDATE work_assets SET moderation_status = $2 WHERE work_id = $1",
      [workId, decision.status === "approved" ? "approved" : "rejected"],
    );

    await client.query(`
      INSERT INTO audit_records (id, target_type, target_id, reviewer_id, action, reason)
      VALUES ($1, 'work', $2, $3, $4, $5)
    `, [randomUUID(), workId, reviewerId, decision.status === "approved" ? "approve" : "reject", decision.note || null]);
    return true;
  }

  private mapUser(row: UserRow): AdminUser {
    const dailyLimit = Number(row.daily_limit ?? 0);
    const monthlyLimit = Number(row.monthly_limit ?? 0);
    const concurrentLimit = Number(row.concurrent_limit ?? 0);
    const monthlyUsed = Number(row.monthly_used ?? 0);
    const activeJobs = Number(row.active_jobs ?? 0);
    const quotaExhausted =
      (monthlyLimit > 0 && monthlyUsed >= monthlyLimit) ||
      (concurrentLimit > 0 && activeJobs >= concurrentLimit);
    const status = row.account_status === "disabled"
      ? "suspended"
      : row.account_status === "pending"
        ? "pending"
        : quotaExhausted
          ? "limited"
          : "active";
    const role = row.roles?.[0] ?? "student";

    return {
      id: row.id,
      name: row.name,
      initials: row.name.slice(0, 1),
      department: row.department,
      identity: this.roleLabel(role),
      accountStatus: row.account_status,
      quotaStatus: quotaExhausted ? "exhausted" : "normal",
      status,
      dailyLimit,
      monthlyLimit,
      monthlyUsed,
      concurrentLimit,
      works: Number(row.works ?? 0),
      // 用户表当前没有登录日志；此处暂以资料更新时间作为保守替代。
      lastActive: row.last_active.toISOString(),
    };
  }

  private roleLabel(role: string) {
    return ({ admin: "管理员", operator: "运营", teacher: "教师", student: "学生" } as Record<string, string>)[role] ?? role;
  }
}
