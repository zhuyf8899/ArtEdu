import assert from "node:assert/strict";
import test from "node:test";
import type { PoolClient } from "pg";
import type { DatabaseService } from "../database/database.service";
import type { AuthService } from "../auth/auth.service";
import type { RagService } from "../rag/rag.service";
import { CoursesService } from "./courses.service";
import type { Actor } from "../auth/auth.service";

test("图谱配置锁定课程并拒绝跨课程课时、非所有者及审核中课程", async () => {
  const writes: string[] = [];
  let status = "published";
  const database = { transaction: async (work: (client: unknown) => unknown) => work({ query: async (sql: string) => {
    if (sql.startsWith("SELECT status")) return { rows: [{ status, created_by: "owner" }] };
    if (sql.startsWith("SELECT id FROM course_lessons")) return { rows: [{ id: "lesson" }] };
    writes.push(sql); return { rows: [] };
  } }) } as unknown as DatabaseService;
  const auth = { requireAnyRole: (actor: Actor) => { if (!actor.roles.some((role) => ["teacher", "operator", "admin"].includes(role))) throw new Error("权限不足"); } } as unknown as AuthService;
  const service = new CoursesService(database, auth, {} as RagService);
  const teacher = { id: "owner", roles: ["teacher"] } as Actor;
  const input = { knowledgePoints: ["构图"], lessons: [{ lessonId: "lesson", knowledgePoints: ["视觉层级"] }] };
  await assert.rejects(service.updateKnowledgeBindings({ id: "student", roles: ["student"] } as Actor, "c", input), /权限/);
  await assert.rejects(service.updateKnowledgeBindings({ id: "other", roles: ["teacher"] } as Actor, "c", input), /自己创建/);
  await assert.rejects(service.updateKnowledgeBindings(teacher, "c", { ...input, lessons: [{ lessonId: "other", knowledgePoints: [] }] }), /不属于/);
  status = "pending_review";
  await assert.rejects(service.updateKnowledgeBindings(teacher, "c", input), /待审核/);
  assert.equal(writes.length, 0);
  status = "published";
  service.getManagedDetail = async () => ({ id: "c" }) as never;
  await service.updateKnowledgeBindings(teacher, "c", input);
  assert.match(writes[0], /knowledge_points/);
  assert.match(writes[1], /WHERE id=\$1 AND course_id=\$2/);
  assert.match(writes[2], /audit_records/);
  assert.doesNotMatch(writes.join("\n"), /learning_progress|course_enrollments|DELETE|version_number|status =/);
});

test("管理员读取课程保留学习步骤、完成标准和知识点", async () => {
  const database = { query: async (sql: string) => ({ rows: sql.includes("SELECT c.*") ? [{ id: "c", created_by: "owner", knowledge_points: ["纹样"] }]
    : sql.includes("FROM course_lessons") ? [{ id: "l", title: "观察", knowledge_points: ["纹样提取"], learning_steps: ["对比形态"], practice_task: "做两版", completion_criteria: "说明取舍", requires_work_submission: true }] : [] }) } as unknown as DatabaseService;
  const service = new CoursesService(database, { requireAnyRole: () => undefined } as unknown as AuthService, {} as RagService);
  const detail = await service.getManagedDetail({ id: "owner", roles: ["teacher"] } as Actor, "c");
  assert.deepEqual(detail.knowledgePoints, ["纹样"]);
  assert.deepEqual(detail.lessons[0].learningSteps, ["对比形态"]);
  assert.deepEqual(detail.lessons[0].knowledgePoints, ["纹样提取"]);
  assert.equal(detail.lessons[0].practiceTask, "做两版");
  assert.equal(detail.lessons[0].completionCriteria, "说明取舍");
  assert.equal(detail.lessons[0].requiresWorkSubmission, true);
});

test("编辑已有课时保留课时 ID，资料所属课时不会被清空", async () => {
  const statements: string[] = [];
  const client = {
    query: async (sql: string) => {
      statements.push(sql);
      return { rows: sql.startsWith("SELECT id FROM course_lessons") ? [{ id: "lesson-existing" }] : [] };
    },
  } as unknown as PoolClient;
  const service = new CoursesService({} as DatabaseService, {} as AuthService, {} as RagService);
  await service["replaceLessons"](client, "course-a", [{
    id: "lesson-existing", title: "更新名称", summary: "保留资料关联", lessonType: "lesson",
    estimatedMinutes: 40, modelConfigIds: [],
    learningSteps: [], practiceTask: "", completionCriteria: "", requiresWorkSubmission: false,
  }]);
  assert.ok(statements.some((sql) => sql.startsWith("UPDATE course_lessons")));
  assert.equal(statements.some((sql) => sql.startsWith("DELETE FROM course_lessons")), false);
});

test("未发布课程的封面只对管理者开放，异常存储键不能读取", async () => {
  let status = "draft";
  let coverKey = "admin/courses/course-a/covers/../../private";
  const database = { query: async () => ({ rows: [{ status, created_by: "teacher-a", cover_asset_key: coverKey, cover_mime_type: "image/jpeg" }] }) } as unknown as DatabaseService;
  const service = new CoursesService(database, {} as AuthService, {} as RagService);
  const student = { id: "student-a", roles: ["student"] } as Actor;
  const teacher = { id: "teacher-a", roles: ["teacher"] } as Actor;
  await assert.rejects(service.openCover(student, "course-a"), /封面不存在/);
  await assert.rejects(service.openCover(teacher, "course-a"), /封面不存在/);
  status = "published";
  coverKey = "admin/courses/other-course/covers/11111111-1111-1111-1111-111111111111-22222222-2222-2222-2222-222222222222";
  await assert.rejects(service.openCover(student, "course-a"), /封面不存在/);
});
