import assert from "node:assert/strict";
import test from "node:test";
import { runGenerationJobSchema } from "./generation.contracts";

test("同步模型执行必须选择服务端模型配置", () => {
  assert.equal(runGenerationJobSchema.safeParse({ jobType: "image", prompt: "设计课程卡片", parameters: {} }).success, false);
  const parsed = runGenerationJobSchema.parse({
    jobType: "image",
    prompt: "设计课程卡片",
    modelConfigId: "model-deepseek-v4-flash",
    parameters: {},
  });
  assert.equal(parsed.modelConfigId, "model-deepseek-v4-flash");
});
