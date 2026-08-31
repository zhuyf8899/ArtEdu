import assert from "node:assert/strict";
import test from "node:test";
import {
  createLearningNoteSchema,
  createLearningTaskSchema,
  updateLearningTaskSchema,
} from "./learning.contracts";

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
