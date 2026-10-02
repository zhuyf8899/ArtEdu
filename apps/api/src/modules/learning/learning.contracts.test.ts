import assert from "node:assert/strict";
import test from "node:test";
import { LearningService } from "./learning.service";
import type { DatabaseService } from "../database/database.service";
import type { Actor } from "../auth/auth.service";
import {
  createLearningNoteSchema,
  createLearningTaskSchema,
  updateLearningTaskSchema,
} from "./learning.contracts";

test("图谱课时内容只读取当前用户已选的已发布课程，进度按本人关联", async () => {
  const lesson = { id: "l", courseId: "c", courseTitle: "艺术设计", title: "配色构图", learningSteps: ["比较冷暖色"], progressPercent: 100 };
  let lessonQuery = "";
  const service = new LearningService({ query: async (sql: string, parameters: unknown[]) => {
    assert.doesNotMatch(sql, /INSERT|UPDATE|DELETE/);
    assert.deepEqual(parameters, ["student-a"]);
    if (sql.includes('l.learning_steps AS "learningSteps"')) {
      lessonQuery = sql;
      return { rows: [lesson] };
    }
    return { rows: [] };
  } } as unknown as DatabaseService);
  const dashboard = await service.getDashboard({ id: "student-a", displayName: "学生", roles: ["student"] } as Actor);
  assert.deepEqual(dashboard.learningLessons, [lesson]);
  assert.match(lessonQuery, /e.user_id = \$1/);
  assert.match(lessonQuery, /e.status <> 'withdrawn'/);
  assert.match(lessonQuery, /c.status = 'published'/);
  assert.match(lessonQuery, /l.status = 'published'/);
  assert.match(lessonQuery, /p.user_id = e.user_id/);
  assert.match(lessonQuery, /l.workflow_id AS "workflowId"/);
});

test("学习任务限制日期格式和任务类型", () => {
  assert.equal(createLearningTaskSchema.safeParse({ title: "复习课程", dueDate: "2026-09-01" }).success, true);
  assert.equal(createLearningTaskSchema.safeParse({ title: "复习课程", dueDate: "09/01/2026" }).success, false);
  assert.equal(createLearningTaskSchema.safeParse({ title: "复习课程", taskType: "unknown" }).success, false);
});

test("学习任务更新拒绝空请求", () => {
  assert.equal(updateLearningTaskSchema.safeParse({}).success, false);
  assert.equal(updateLearningTaskSchema.safeParse({ status: "completed" }).success, true);
});

test("学习笔记要求标题和正文", () => {
  assert.equal(createLearningNoteSchema.safeParse({ title: "色彩记录", content: "记录配色推导。" }).success, true);
  assert.equal(createLearningNoteSchema.safeParse({ title: "", content: "" }).success, false);
});
