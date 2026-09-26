import assert from "node:assert/strict";
import test from "node:test";
import type { PoolClient } from "pg";
import type { DatabaseService } from "../database/database.service";
import type { AuthService } from "../auth/auth.service";
import type { RagService } from "../rag/rag.service";
import { CoursesService } from "./courses.service";
import type { Actor } from "../auth/auth.service";

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
