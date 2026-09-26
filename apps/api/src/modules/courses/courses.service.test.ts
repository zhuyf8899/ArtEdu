import assert from "node:assert/strict";
import test from "node:test";
import type { PoolClient } from "pg";
import type { DatabaseService } from "../database/database.service";
import type { AuthService } from "../auth/auth.service";
import type { RagService } from "../rag/rag.service";
import { CoursesService } from "./courses.service";

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
