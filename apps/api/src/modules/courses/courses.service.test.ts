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

test("已退课学生不再获得课件链接，有效选课仍提供预览", async () => {
  let enrollment = 'withdrawn';
  const database = {query: async (sql: string) => {
    if(sql.includes('MAX(my_e.status)')) return {rows:[{id:'course-a',created_by:'teacher-a',enrollment_status:enrollment,status:'published',title:'课程'}]};
    if(sql.includes('FROM course_resources')) return {rows:[{id:'resource-a',course_id:'course-a',title:'课件',resource_type:'pdf',storage_key:'private.pdf',mime_type:'application/pdf'}]};
    return {rows:[]};
  }} as unknown as DatabaseService;
  const service = new CoursesService(database, {} as AuthService, {} as RagService);
  const student = {id:'student-a',roles:['student']} as Actor;
  const withdrawn = await service.getPublished(student,'course-a');
  assert.equal(withdrawn.resources[0].previewUrl,null);
  assert.equal(withdrawn.resources[0].downloadUrl,null);
  enrollment='in_progress';
  const active=await service.getPublished(student,'course-a');
  assert.match(active.resources[0].previewUrl ?? '', /resources\/resource-a\/preview/);
});
