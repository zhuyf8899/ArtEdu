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

test("内部图片路由保留图片产物、上下文和实际模型 ID", async () => {
  let saved: unknown;
  let actualModel: unknown;
  let request: ModelRequest | undefined;
  const repository = {
    markRunning: async () => true,
    completeJob: async () => ({ id: "image-job", status: "succeeded" }),
    createOutput: async (_id: string, artifact: unknown) => { saved = artifact; },
    recordUsage: async (usage: { modelConfigId: string }) => { actualModel = usage.modelConfigId; },
  };
  const model = { id: "internal-image", execute: async (input: ModelRequest) => {
    request = input;
    return { kind: "asset", content: "generated/image-job/image.png", mimeType: "image/png", metadata: { fileName: "image.png", fileSize: 123 } };
  } };
  const service = new GenerationService({} as never, repository as never, { getForJob: () => model } as never);
  service.createJob = async inputActor => ({ id: "image-job", userId: inputActor.id } as GenerationJob);
  const result = await service.runJob(actor, { jobType: "image", prompt: "海浪", parameters: {}, context: [{ role: "user", content: "蓝白色" }] });
  assert.equal(actualModel, "internal-image");
  assert.equal(request?.jobId, "image-job");
  assert.equal(request?.messages?.[1].content, "蓝白色");
  assert.equal(result.artifact?.mimeType, "image/png");
  assert.ok(saved);
});

test("文档结构失败保留实际模型用量，且不创建残缺下载文件", async () => {
  const usage: Array<Record<string, unknown>> = [];
  let exported = false;
  let failed = false;
  const repository = {
    markRunning: async () => true,
    failJob: async () => { failed = true; },
    recordUsage: async (input: Record<string, unknown>) => { usage.push(input); },
  };
  const registry = { getForJob: () => ({ execute: async () => ({ content: "invalid JSON", metadata: { inputTokens: 40, outputTokens: 20 } }) }) };
  const exporter = { create: async () => { exported = true; } };
  const service = new GenerationService({} as never, repository as never, registry as never, exporter as never);
  service.createJob = async () => ({ id: "job-invalid-document" } as GenerationJob);
  await assert.rejects(service.runJob(actor, { jobType: "document", prompt: "教案", modelConfigId: "model", parameters: { outputFormat: "docx" } }), /结构/);
  assert.equal(failed, true);
  assert.equal(exported, false);
  assert.equal(usage[0].inputUnits, 40);
  assert.equal(usage[0].outputUnits, 20);
  assert.equal(usage[0].status, "failed");
});

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
