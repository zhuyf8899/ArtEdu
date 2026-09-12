import assert from "node:assert/strict";
import test from "node:test";
import { runGenerationJobSchema } from "./generation.contracts";

test("同步模型执行必须选择服务端模型配置", () => {
  assert.equal(runGenerationJobSchema.safeParse({ jobType: "document", prompt: "设计课程卡片", parameters: {} }).success, false);
  assert.equal(runGenerationJobSchema.safeParse({ jobType: "image", prompt: "设计课程卡片", parameters: {} }).success, true);
  const parsed = runGenerationJobSchema.parse({
    jobType: "image",
    prompt: "设计课程卡片",
    modelConfigId: "model-deepseek-v4-flash",
    parameters: {},
  });
  assert.equal(parsed.modelConfigId, "model-deepseek-v4-flash");
});

// 问答是默认能力：过去 job_type 枚举里没有 chat，提问会被"生图"接走。
test("问答任务可提交，但同样必须选择服务端模型配置", () => {
  assert.equal(runGenerationJobSchema.safeParse({ jobType: "chat", prompt: "讲讲宋代山水画的构图特点", parameters: {} }).success, false);
  const parsed = runGenerationJobSchema.parse({
    jobType: "chat",
    prompt: "讲讲宋代山水画的构图特点",
    modelConfigId: "model-deepseek-v4-flash",
    parameters: {},
  });
  assert.equal(parsed.jobType, "chat");
  assert.equal(parsed.modelConfigId, "model-deepseek-v4-flash");
});
