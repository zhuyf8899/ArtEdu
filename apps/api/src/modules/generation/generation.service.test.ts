import assert from "node:assert/strict";
import test from "node:test";
import type { Actor } from "../auth/auth.service";
import type { GenerationJob } from "./generation.repository";
import { GenerationService } from "./generation.service";
import type { ModelRequest } from "./model-adapter";

const actor: Actor = {
  id: "user-student-demo",
  username: "student.demo",
  displayName: "学生演示账号",
  accountStatus: "active",
  roles: ["student"],
};

test("同步创作完成后返回模型正文并记录 token 用量", async () => {
  const queuedJob: GenerationJob = {
    id: "job-deepseek-test",
    userId: actor.id,
    jobType: "image",
    prompt: "设计一张艺术课程卡片",
    status: "queued",
    errorMessage: null,
    createdAt: new Date(0).toISOString(),
    startedAt: null,
    completedAt: null,
  };
  let invocation: ModelRequest | undefined;
  const usage: Array<Record<string, unknown>> = [];
  const repository = {
    markRunning: async () => ({ ...queuedJob, status: "running" as const }),
    completeJob: async () => ({ ...queuedJob, status: "succeeded" as const }),
    failJob: async () => undefined,
    recordUsage: async (input: Record<string, unknown>) => { usage.push(input); },
  };
  const registry = {
    getForJob: () => ({
      id: "model-deepseek-v4-flash",
      capabilities: ["image"],
      execute: async (request: ModelRequest) => {
        invocation = request;
        return { kind: "text" as const, content: "可执行的视觉创作方案", metadata: { inputTokens: 21, outputTokens: 34 } };
      },
    }),
  };
  const service = new GenerationService({} as never, repository as never, registry as never);
  service.createJob = async () => queuedJob;

  const result = await service.runJob(actor, {
    jobType: "image",
    prompt: queuedJob.prompt,
    modelConfigId: "model-deepseek-v4-flash",
    parameters: {},
  });

  assert.equal(result.job.status, "succeeded");
  assert.equal(result.output.content, "可执行的视觉创作方案");
  assert.equal(invocation?.messages?.[1]?.content, queuedJob.prompt);
  assert.deepEqual(usage, [{
    userId: actor.id,
    modelConfigId: "model-deepseek-v4-flash",
    requestId: queuedJob.id,
    inputUnits: 21,
    outputUnits: 34,
    status: "success",
  }]);
});
