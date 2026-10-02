import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { PoolClient, QueryResultRow } from "pg";
import { ADMIN_MANAGEMENT_ROLES } from "../../common/constants";
import { AuthService, type Actor } from "../auth/auth.service";
import { DatabaseService } from "../database/database.service";
import type { ActivityInput, GoalInput, GoalUpdate, NodeInput, NodeLinks, NodeUpdate } from "./knowledge.contracts";

interface NodeRow extends QueryResultRow { id: string; title: string; description: string; domain: string; sort_order: number; status: string; }
interface EdgeRow extends QueryResultRow { from_node_id: string; to_node_id: string; relation: "prerequisite" | "related"; }
interface BindingRow extends QueryResultRow { node_id: string; target_type: string; target_id: string; }
interface GoalRow extends QueryResultRow { id: string; title: string; description: string; sort_order: number; status: string; }
interface NodeGoalRow extends QueryResultRow { node_id: string; goal_id: string; }
interface ProgressRow extends QueryResultRow { node_id: string; progress: number; evidence_count: number; }

@Injectable()
export class KnowledgeService {
  constructor(private readonly database: DatabaseService, private readonly auth: AuthService) {}

  private async graph(managed: boolean) {
    const filter = managed ? "" : "WHERE status = 'published'";
    const [nodes, edges, bindings, goals, nodeGoals] = await Promise.all([
      this.database.query<NodeRow>(`SELECT * FROM knowledge_nodes ${filter} ORDER BY sort_order, id`),
      this.database.query<EdgeRow>(`SELECT e.* FROM knowledge_edges e JOIN knowledge_nodes a ON a.id=e.from_node_id JOIN knowledge_nodes b ON b.id=e.to_node_id ${managed ? "" : "WHERE a.status='published' AND b.status='published'"}`),
      this.database.query<BindingRow>(`SELECT b.* FROM knowledge_bindings b JOIN knowledge_nodes n ON n.id=b.node_id ${managed ? "" : "WHERE n.status='published'"}`),
      this.database.query<GoalRow>(`SELECT * FROM ability_goals ${filter} ORDER BY sort_order, id`),
      this.database.query<NodeGoalRow>(`SELECT ng.* FROM knowledge_ability_goals ng JOIN knowledge_nodes n ON n.id=ng.node_id JOIN ability_goals g ON g.id=ng.goal_id ${managed ? "" : "WHERE n.status='published' AND g.status='published'"}`),
    ]);
    return { nodes: nodes.rows, edges: edges.rows, bindings: bindings.rows, goals: goals.rows, nodeGoals: nodeGoals.rows };
  }

  async getManagedMap(actor: Actor) {
    this.auth.requireAnyRole(actor, ADMIN_MANAGEMENT_ROLES);
    const graph = await this.graph(true);
    return { nodes: graph.nodes.map(this.mapNode), edges: graph.edges.map(this.mapEdge), bindings: graph.bindings.map(this.mapBinding), goals: graph.goals.map(this.mapGoal), nodeGoals: graph.nodeGoals.map((row) => ({ nodeId: row.node_id, goalId: row.goal_id })) };
  }

  private async progress(userId: string) {
    const result = await this.database.query<ProgressRow>(`
      WITH evidence AS (
        SELECT b.node_id, p.progress_percent::int AS score
        FROM knowledge_bindings b JOIN course_lessons l ON b.target_type='lesson' AND l.id=b.target_id AND l.status='published'
        JOIN courses c ON c.id=l.course_id AND c.status='published'
        JOIN learning_progress p ON p.lesson_id=l.id AND p.user_id=$1
        UNION ALL
        SELECT b.node_id, COALESCE(ROUND(AVG(COALESCE(p.progress_percent,0))),0)::int
        FROM knowledge_bindings b JOIN courses c ON b.target_type='course' AND c.id=b.target_id AND c.status='published'
        JOIN course_enrollments ce ON ce.course_id=c.id AND ce.user_id=$1 AND ce.status <> 'withdrawn'
        JOIN course_lessons l ON l.course_id=c.id AND l.status='published'
        LEFT JOIN learning_progress p ON p.lesson_id=l.id AND p.user_id=$1
        GROUP BY b.node_id,b.target_id
        UNION ALL
        SELECT b.node_id, CASE WHEN r.status='completed' THEN 100 ELSE 50 END
        FROM knowledge_bindings b JOIN workflows w ON b.target_type='workflow' AND w.id=b.target_id AND w.status='published'
        JOIN workflow_runs r ON r.workflow_id=w.id AND r.user_id=$1 AND r.status <> 'cancelled'
        UNION ALL
        SELECT b.node_id, CASE WHEN r.status='completed' THEN 100 ELSE 50 END
        FROM knowledge_bindings b JOIN tools t ON b.target_type='tool' AND t.id=b.target_id AND t.status='published'
        JOIN workflow_tools wt ON wt.tool_id=t.id JOIN workflow_runs r ON r.workflow_id=wt.workflow_id AND r.user_id=$1 AND r.status <> 'cancelled'
        UNION ALL
        SELECT node_id, CASE activity_type WHEN 'learn' THEN 30 WHEN 'practice' THEN 70 ELSE 100 END
        FROM knowledge_activity_events WHERE user_id=$1
      )
      SELECT node_id, MAX(score)::int AS progress, COUNT(*)::int AS evidence_count FROM evidence GROUP BY node_id
    `, [userId]);
    return new Map(result.rows.map((row) => [row.node_id, { progress: Number(row.progress), evidenceCount: Number(row.evidence_count) }]));
  }

  async getMap(actor: Actor) {
    const [graph, progress] = await Promise.all([this.graph(false), this.progress(actor.id)]);
    const nodes = graph.nodes.map((row) => {
      const activity = progress.get(row.id) ?? { progress: 0, evidenceCount: 0 };
      return { ...this.mapNode(row), progressPercent: activity.progress, evidenceCount: activity.evidenceCount,
        state: activity.progress >= 100 ? "completed" : activity.progress > 0 ? "in_progress" : "not_started" };
    });
    const completed = new Set(nodes.filter((node) => node.state === "completed").map((node) => node.id));
    const recommendations = nodes.filter((node) => node.state !== "completed" && graph.edges
      .filter((edge) => edge.relation === "prerequisite" && edge.to_node_id === node.id)
      .every((edge) => completed.has(edge.from_node_id)))
      .sort((a, b) => (b.progressPercent - a.progressPercent) || (a.sortOrder - b.sortOrder))
      .slice(0, 3).map((node) => ({ nodeId: node.id, reason: node.progressPercent > 0 ? "继续学习" : "前置知识点已完成" }));
    return { nodes, edges: graph.edges.map(this.mapEdge), bindings: graph.bindings.map(this.mapBinding), recommendations,
      summary: { total: nodes.length, completed: completed.size, inProgress: nodes.filter((node) => node.state === "in_progress").length } };
  }

  async getAbilities(actor: Actor) {
    const [graph, progress] = await Promise.all([this.graph(false), this.progress(actor.id)]);
    return { goals: graph.goals.map((goal) => {
      const nodeIds = graph.nodeGoals.filter((link) => link.goal_id === goal.id).map((link) => link.node_id);
      const percent = nodeIds.length ? Math.round(nodeIds.reduce((sum, id) => sum + (progress.get(id)?.progress ?? 0), 0) / nodeIds.length) : 0;
      return { ...this.mapGoal(goal), nodeIds, progressPercent: percent, completedNodes: nodeIds.filter((id) => (progress.get(id)?.progress ?? 0) >= 100).length, totalNodes: nodeIds.length };
    }) };
  }

  async getToolTrail(actor: Actor) {
    const result = await this.database.query(`
      SELECT t.id, t.name, t.description, t.category, t.entry_url AS "entryUrl", COUNT(DISTINCT r.id)::int AS "runCount",
        COUNT(DISTINCT r.id) FILTER (WHERE r.status='completed')::int AS "completedRunCount", MAX(r.updated_at) AS "lastUsedAt",
        (SELECT COUNT(*)::int FROM tool_usage_events u WHERE u.tool_id=t.id AND u.user_id=$1) AS "directUseCount",
        (SELECT MAX(u.occurred_at) FROM tool_usage_events u WHERE u.tool_id=t.id AND u.user_id=$1) AS "lastDirectUseAt",
        COALESCE(array_agg(DISTINCT b.node_id) FILTER (WHERE n.status='published'), '{}') AS "nodeIds"
      FROM tools t LEFT JOIN workflow_tools wt ON wt.tool_id=t.id
      LEFT JOIN workflow_runs r ON r.workflow_id=wt.workflow_id AND r.user_id=$1 AND r.status <> 'cancelled'
      LEFT JOIN knowledge_bindings b ON b.target_type='tool' AND b.target_id=t.id
      LEFT JOIN knowledge_nodes n ON n.id=b.node_id
      WHERE t.status='published' GROUP BY t.id ORDER BY "runCount" DESC, t.name
    `, [actor.id]);
    return { tools: result.rows };
  }

  async getGrowth(actor: Actor) {
    const [events, summary] = await Promise.all([
      this.database.query(`
        SELECT * FROM (
          SELECT e.id, e.activity_type AS type, n.title, e.node_id AS "nodeId", e.minutes, e.note, e.occurred_at AS "occurredAt"
          FROM knowledge_activity_events e JOIN knowledge_nodes n ON n.id=e.node_id WHERE e.user_id=$1
          UNION ALL
          SELECT 'lesson:' || p.lesson_id, 'lesson', l.title, NULL, 0, '', p.updated_at
          FROM learning_progress p JOIN course_lessons l ON l.id=p.lesson_id WHERE p.user_id=$1 AND p.progress_percent=100
          UNION ALL
          SELECT 'workflow:' || r.id, 'workflow', w.name, NULL, 0, '', r.updated_at
          FROM workflow_runs r JOIN workflows w ON w.id=r.workflow_id WHERE r.user_id=$1 AND r.status='completed'
          UNION ALL
          SELECT 'work:' || w.id, 'work', w.title, NULL, 0, '', w.created_at
          FROM works w WHERE w.author_id=$1
          UNION ALL
          SELECT 'asset:' || a.id, 'upload', a.file_name, NULL, 0, '', a.created_at
          FROM work_assets a JOIN works w ON w.id=a.work_id WHERE w.author_id=$1
          UNION ALL
          SELECT 'tool:' || u.id, 'tool', t.name, NULL, 0, '', u.occurred_at
          FROM tool_usage_events u JOIN tools t ON t.id=u.tool_id WHERE u.user_id=$1
        ) timeline ORDER BY "occurredAt" DESC, id DESC LIMIT 100
      `, [actor.id]),
      this.database.query<{ learning_minutes: number; activities: number; completed_lessons: number; works: number }>(`
        SELECT (SELECT COALESCE(SUM(minutes),0)::int FROM knowledge_activity_events WHERE user_id=$1) AS learning_minutes,
          (SELECT COUNT(*)::int FROM knowledge_activity_events WHERE user_id=$1) AS activities,
          (SELECT COUNT(*)::int FROM learning_progress WHERE user_id=$1 AND progress_percent=100) AS completed_lessons,
          (SELECT COUNT(*)::int FROM works WHERE author_id=$1) AS works
      `, [actor.id]),
    ]);
    return { summary: summary.rows[0], timeline: events.rows };
  }

  async recordActivity(actor: Actor, input: ActivityInput) {
    const node = await this.database.query("SELECT id FROM knowledge_nodes WHERE id=$1 AND status='published'", [input.nodeId]);
    if (!node.rows[0]) throw new NotFoundException("知识点不存在或尚未发布");
    const occurredAt = input.occurredAt ? new Date(input.occurredAt) : new Date();
    if (occurredAt.getTime() > Date.now() + 60_000 || occurredAt.getTime() < Date.now() - 365 * 86400_000) throw new BadRequestException("记录时间超出允许范围");
    const result = await this.database.query(`
      INSERT INTO knowledge_activity_events(id,user_id,node_id,activity_type,minutes,note,occurred_at)
      VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id,node_id AS "nodeId",activity_type AS "activityType",minutes,note,occurred_at AS "occurredAt"
    `, [`knowledge-activity-${randomUUID()}`, actor.id, input.nodeId, input.activityType, input.minutes, input.note, occurredAt]);
    return result.rows[0];
  }

  async recordToolUsage(actor: Actor, toolId: string) {
    const tool = await this.database.query("SELECT id FROM tools WHERE id=$1 AND status='published'", [toolId]);
    if (!tool.rows[0]) throw new NotFoundException("工具不存在或尚未发布");
    const result = await this.database.query(`
      INSERT INTO tool_usage_events(id,user_id,tool_id) VALUES($1,$2,$3)
      RETURNING id,tool_id AS "toolId",occurred_at AS "occurredAt"
    `, [`tool-usage-${randomUUID()}`, actor.id, toolId]);
    return result.rows[0];
  }

  async createNode(actor: Actor, input: NodeInput) {
    this.auth.requireAnyRole(actor, ADMIN_MANAGEMENT_ROLES);
    const result = await this.database.query<NodeRow>(`
      INSERT INTO knowledge_nodes(id,title,description,domain,sort_order,status,created_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *
    `, [`knowledge-node-${randomUUID()}`, input.title, input.description, input.domain, input.sortOrder, input.status, actor.id]);
    return this.mapNode(result.rows[0]);
  }

  async updateNode(actor: Actor, nodeId: string, input: NodeUpdate) {
    this.auth.requireAnyRole(actor, ADMIN_MANAGEMENT_ROLES);
    const result = await this.database.query<NodeRow>(`
      UPDATE knowledge_nodes SET title=COALESCE($2,title),description=COALESCE($3,description),domain=COALESCE($4,domain),
        sort_order=COALESCE($5,sort_order),status=COALESCE($6,status),updated_at=CURRENT_TIMESTAMP WHERE id=$1 RETURNING *
    `, [nodeId, input.title ?? null, input.description ?? null, input.domain ?? null, input.sortOrder ?? null, input.status ?? null]);
    if (!result.rows[0]) throw new NotFoundException("知识点不存在");
    return this.mapNode(result.rows[0]);
  }

  async createGoal(actor: Actor, input: GoalInput) {
    this.auth.requireAnyRole(actor, ADMIN_MANAGEMENT_ROLES);
    const result = await this.database.query<GoalRow>(`
      INSERT INTO ability_goals(id,title,description,sort_order,status) VALUES($1,$2,$3,$4,$5) RETURNING *
    `, [`ability-goal-${randomUUID()}`, input.title, input.description, input.sortOrder, input.status]);
    return this.mapGoal(result.rows[0]);
  }

  async updateGoal(actor: Actor, goalId: string, input: GoalUpdate) {
    this.auth.requireAnyRole(actor, ADMIN_MANAGEMENT_ROLES);
    const result = await this.database.query<GoalRow>(`
      UPDATE ability_goals SET title=COALESCE($2,title),description=COALESCE($3,description),sort_order=COALESCE($4,sort_order),
        status=COALESCE($5,status),updated_at=CURRENT_TIMESTAMP WHERE id=$1 RETURNING *
    `, [goalId, input.title ?? null, input.description ?? null, input.sortOrder ?? null, input.status ?? null]);
    if (!result.rows[0]) throw new NotFoundException("能力目标不存在");
    return this.mapGoal(result.rows[0]);
  }

  async setLinks(actor: Actor, nodeId: string, input: NodeLinks) {
    this.auth.requireAnyRole(actor, ADMIN_MANAGEMENT_ROLES);
    if (input.edges.some((edge) => edge.toNodeId === nodeId)) throw new BadRequestException("知识点不能连接自身");
    if (new Set(input.edges.map((edge) => `${edge.toNodeId}:${edge.relation}`)).size !== input.edges.length ||
        new Set(input.bindings.map((item) => `${item.targetType}:${item.targetId}`)).size !== input.bindings.length ||
        new Set(input.goalIds).size !== input.goalIds.length) throw new BadRequestException("关联项不能重复");
    await this.database.transaction(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(7410633)");
      await this.assertIds(client, "knowledge_nodes", [nodeId, ...input.edges.map((edge) => edge.toNodeId)]);
      await this.assertIds(client, "ability_goals", input.goalIds);
      const tableByType = { course: "courses", lesson: "course_lessons", workflow: "workflows", tool: "tools" } as const;
      for (const type of Object.keys(tableByType) as Array<keyof typeof tableByType>) {
        await this.assertIds(client, tableByType[type], input.bindings.filter((binding) => binding.targetType === type).map((binding) => binding.targetId));
      }
      const existing = await client.query<EdgeRow>("SELECT * FROM knowledge_edges WHERE relation='prerequisite' AND from_node_id<>$1", [nodeId]);
      const prereqs = [...existing.rows.map((row) => [row.from_node_id, row.to_node_id]),
        ...input.edges.filter((edge) => edge.relation === "prerequisite").map((edge) => [nodeId, edge.toNodeId])];
      const outgoing = new Map<string, string[]>();
      for (const [from, to] of prereqs) outgoing.set(from, [...(outgoing.get(from) ?? []), to]);
      const active = new Set<string>(); const visited = new Set<string>();
      const visit = (id: string): boolean => {
        if (active.has(id)) return true;
        if (visited.has(id)) return false;
        active.add(id);
        for (const next of outgoing.get(id) ?? []) if (visit(next)) return true;
        active.delete(id); visited.add(id); return false;
      };
      for (const id of outgoing.keys()) if (visit(id)) throw new BadRequestException("前置知识点不能形成环");
      await client.query("DELETE FROM knowledge_edges WHERE from_node_id=$1", [nodeId]);
      await client.query("DELETE FROM knowledge_bindings WHERE node_id=$1", [nodeId]);
      await client.query("DELETE FROM knowledge_ability_goals WHERE node_id=$1", [nodeId]);
      for (const edge of input.edges) await client.query("INSERT INTO knowledge_edges(from_node_id,to_node_id,relation) VALUES($1,$2,$3)", [nodeId, edge.toNodeId, edge.relation]);
      for (const binding of input.bindings) await client.query("INSERT INTO knowledge_bindings(node_id,target_type,target_id) VALUES($1,$2,$3)", [nodeId, binding.targetType, binding.targetId]);
      for (const goalId of input.goalIds) await client.query("INSERT INTO knowledge_ability_goals(node_id,goal_id) VALUES($1,$2)", [nodeId, goalId]);
    });
    return { nodeId, ...input };
  }

  private async assertIds(client: PoolClient, table: string, ids: string[]) {
    if (!ids.length) return;
    const unique = [...new Set(ids)];
    const result = await client.query<{ id: string }>(`SELECT id FROM ${table} WHERE id=ANY($1::text[])`, [unique]);
    if (result.rows.length !== unique.length) throw new BadRequestException(`关联的 ${table} 记录不存在`);
  }

  private mapNode(row: NodeRow) { return { id: row.id, title: row.title, description: row.description, domain: row.domain, sortOrder: row.sort_order, status: row.status }; }
  private mapEdge(row: EdgeRow) { return { fromNodeId: row.from_node_id, toNodeId: row.to_node_id, relation: row.relation }; }
  private mapBinding(row: BindingRow) { return { nodeId: row.node_id, targetType: row.target_type, targetId: row.target_id }; }
  private mapGoal(row: GoalRow) { return { id: row.id, title: row.title, description: row.description, sortOrder: row.sort_order, status: row.status }; }
}
