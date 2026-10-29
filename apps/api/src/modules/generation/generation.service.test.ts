import assert from "node:assert/strict";
import test from "node:test";
import { HttpException, Logger } from "@nestjs/common";
import type { Actor } from "../auth/auth.service";
import type { GenerationJob } from "./generation.repository";
import { GenerationService } from "./generation.service";
import type { ModelRequest, ModelResult } from "./model-adapter";
import { ImageTransportError } from "./image-transport";
import { ImageConfigurationError } from "../../common/image-configuration";

test('编辑原图和遮罩在创建付费任务前逐一授权，不能读取他人素材', async () => {
  const checked: string[] = [];
  const storage = { readImageForVision: async (a: Actor, id: string) => {
    assert.equal(a.id, actor.id); checked.push(id);
    if (id === 'other-mask') throw new Error('无权读取该临时文件');
    return { fileName: 'image.png', dataUrl: 'data:image/png;base64,' };
  }};
  const service = new GenerationService({} as never, {} as never, {getForJob:()=>{throw Error('must not route');}} as never, undefined, storage as never);
  service.createJob=async()=>{throw Error('must not create');};
  await assert.rejects(service.runJob(actor,{jobType:'image',prompt:'编辑',parameters:{referenceFileId:'mine',maskFileId:'other-mask'}}),/无权/);
  assert.deepEqual(checked,['mine','other-mask']);
  await assert.rejects(service.runJob(actor,{jobType:'image',prompt:'编辑',parameters:{maskFileId:'orphan'}}),/遮罩需要原图/);
});

test('编辑任务将授权读取的图片传给编辑适配器，不以视觉聊天或文生图替代',async context=>{
  context.mock.method(Logger.prototype,'error',()=>undefined);
  const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j6l8AAAAASUVORK5CYII=';
  const image={fileName:'private.png',dataUrl:png};let called=false;
  const registry={getForJob:(input:any)=>{assert.equal(input.imageEditing,true);return {id:'editor',execute:async(request:ModelRequest)=>{called=true;assert.deepEqual(request.imageEdit,{image,mask:image});throw new ImageTransportError('submit',1,'HTTP_400',400);}};}};
  const repository={markRunning:async()=>true,failJob:async()=>{},recordUsage:async()=>{}};
  const service=new GenerationService({} as never,repository as never,registry as never,undefined,{readImageForVision:async()=>image} as never);
  service.createJob=async()=>({id:'edit-routing-test'} as GenerationJob);
  await assert.rejects(service.runJob(actor,{jobType:'image',prompt:'编辑选区',parameters:{referenceFileId:'image',maskFileId:'mask'}}));
  assert.equal(called,true);
});

test("生图缺通道或缺密钥时在创建任务和额度计数前停止，返回不可重试配置错误", async () => {
  for (const code of ['IMAGE_PROVIDER_NOT_CONFIGURED','IMAGE_PROVIDER_KEY_MISSING'] as const) {
    let created = false;
    const registry = {getForJob:(input:{requireConfigured?:boolean})=>{
      assert.equal(input.requireConfigured,true);
      throw new ImageConfigurationError(code);
    }};
    const service = new GenerationService({} as never,{} as never,registry as never);
    service.createJob=async()=>{created=true;throw Error('must not create a job');};
    await assert.rejects(service.runJob(actor,{jobType:'image',prompt:'海浪',parameters:{}}),(error:unknown)=>{
      assert.ok(error instanceof HttpException);
      assert.equal(error.getStatus(),503);
      const response=error.getResponse() as {code:string;retryable:boolean;message:string};
      assert.equal(response.code,code);assert.equal(response.retryable,false);
      assert.match(response.message,/图片/);return true;
    });
    assert.equal(created,false);
  }
});

const actor: Actor = {
  id: "user-student-demo",
  username: "student.demo",
  displayName: "学生演示账号",
  accountStatus: "active",
  roles: ["student"],
};

test("图片失败记录具体阶段和原因码，并写入不含密钥的诊断日志", async context => {
  const logged = context.mock.method(Logger.prototype, "error", () => undefined);
  const usage: Array<Record<string, unknown>> = [];
  const repository = {
    markRunning: async () => true,
    failJob: async () => undefined,
    recordUsage: async (record: Record<string, unknown>) => { usage.push(record); },
  };
  const registry = { getForJob: () => ({ id: "internal-image", execute: async () => { throw new ImageTransportError("download", 3, "ECONNRESET"); } }) };
  const service = new GenerationService({} as never, repository as never, registry as never);
  service.createJob = async () => ({ id: "diagnostic-image-job" } as GenerationJob);
  await assert.rejects(service.runJob(actor, { jobType: "image", prompt: "private prompt must not be logged", parameters: {} }), /图片已生成，但文件下载暂时失败/);
  assert.equal(usage[0].errorCode, "image_download_econnreset");
  assert.deepEqual(logged.mock.calls[0].arguments[0], { event: "generation_failed", jobId: "diagnostic-image-job", modelConfigId: "internal-image", jobType: "image", errorCode: "image_download_econnreset", stage: "download", attempts: 3, upstreamStatus: undefined, causeCode: "ECONNRESET" });
  assert.ok(!JSON.stringify(logged.mock.calls).includes("private prompt"));
});

for (const jobType of ["image", "pattern"] as const) {
  for (const output of [
    { kind: "text", content: "只有构图方案" },
    { kind: "asset", content: "generated/fake.svg", mimeType: "image/svg+xml", metadata: { fileSize: 100 } },
    { kind: "asset", content: "generated/empty.png", mimeType: "image/png", metadata: { fileSize: 0 } },
  ] satisfies ModelResult[]) {
    test(`${jobType} 拒绝无效产物 ${output.content}，记录失败且不计为成功`, async () => {
      let completed = false;
      let saved = false;
      let failure = "";
      const usage: Array<Record<string, unknown>> = [];
      const repository = {
        markRunning: async () => true,
        completeJob: async () => { completed = true; },
        createOutput: async () => { saved = true; },
        failJob: async (_id: string, reason: string) => { failure = reason; },
        recordUsage: async (record: Record<string, unknown>) => { usage.push(record); },
      };
      const service = new GenerationService({} as never, repository as never, {
        getForJob: () => ({ id: "image-model", execute: async () => ({ ...output, metadata: { ...output.metadata, inputTokens: 12, outputTokens: 8 } }) }),
      } as never);
      service.createJob = async () => ({ id: "invalid-image-job" } as GenerationJob);
      await assert.rejects(service.runJob(actor, { jobType, prompt: "海浪", parameters: {} }), /检查图片模型协议与配置/);
      assert.match(failure, /未返回有效图片文件/);
      assert.equal(completed, false);
      assert.equal(saved, false);
      assert.equal(usage[0].status, "failed");
      assert.equal(usage[0].errorCode, "image_artifact_error");
      assert.equal(usage[0].inputUnits, 12);
      assert.equal(usage[0].outputUnits, 8);
    });
  }
}

test("内部图片路由保留图片产物、上下文和实际模型 ID", async () => {
  let saved: unknown;
  let actualModel: unknown;
  let jobModel: unknown;
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
  service.createJob = async (inputActor, input) => {
    jobModel = input.modelConfigId;
    return { id: "image-job", userId: inputActor.id } as GenerationJob;
  };
  const result = await service.runJob(actor, { jobType: "image", modelConfigId: "selected-text-model", prompt: "海浪", parameters: {}, context: [{ role: "user", content: "蓝白色" }] });
  assert.equal(actualModel, "internal-image");
  assert.equal(jobModel, "internal-image");
  assert.equal(request?.modelConfigId, "internal-image");
  assert.equal(request?.jobId, "image-job");
  assert.equal(request?.messages?.[1].content, "蓝白色");
  assert.equal(result.artifact?.mimeType, "image/png");
  assert.ok(saved);
});

test("文本模型自动转交生图仍受额度限制，额度不足不调用供应商", async () => {
  const originalEnabled = process.env.MODEL_EXECUTION_ENABLED;
  let invoked = false;
  try {
    process.env.MODEL_EXECUTION_ENABLED = "true";
    const client = { query: async (sql: string, parameters: unknown[]) => {
      if (sql.includes("FROM model_configs")) {
        assert.equal(parameters[0], "internal-image");
        return { rows: [{ id: "internal-image" }], rowCount: 1 };
      }
      if (sql.includes("WITH limits")) return { rows: [{ daily_limit: 0, daily_used: 0, monthly_limit: null, monthly_used: 0, concurrent_limit: null, in_flight: 0 }] };
      return { rows: [], rowCount: 0 };
    } };
    const database = { transaction: async (work: (connection: typeof client) => unknown) => work(client) };
    const registry = { getForJob: () => ({ id: "internal-image", execute: async () => { invoked = true; } }) };
    const service = new GenerationService(database as never, {} as never, registry as never);
    await assert.rejects(service.runJob(actor, { jobType: "image", modelConfigId: "selected-text-model", prompt: "海浪", parameters: {} }), (error: unknown) => error instanceof HttpException && error.getStatus() === 429);
    assert.equal(invoked, false);
  } finally {
    if (originalEnabled === undefined) delete process.env.MODEL_EXECUTION_ENABLED;
    else process.env.MODEL_EXECUTION_ENABLED = originalEnabled;
  }
});

test("文档结构失败保留实际模型用量，且不创建残缺下载文件", async () => {
  const usage: Array<Record<string, unknown>> = [];
  let exported = false;
  let failed = false;
  let attempts = 0;
  const repository = {
    markRunning: async () => true,
    failJob: async () => { failed = true; },
    recordUsage: async (input: Record<string, unknown>) => { usage.push(input); },
  };
  const registry = { getForJob: () => ({ execute: async () => {
    attempts += 1;
    return { content: "invalid JSON", metadata: { inputTokens: 40, outputTokens: 20 } };
  } }) };
  const exporter = { create: async () => { exported = true; } };
  const service = new GenerationService({} as never, repository as never, registry as never, exporter as never);
  service.createJob = async () => ({ id: "job-invalid-document" } as GenerationJob);
  await assert.rejects(service.runJob(actor, { jobType: "document", prompt: "教案", modelConfigId: "model", parameters: { outputFormat: "docx" } }), /结构/);
  assert.equal(failed, true);
  assert.equal(exported, false);
  // 首轮不合格后会再按失败原因自修复一次，两次调用都必须计入用量。
  assert.equal(attempts, 2);
  assert.equal(usage[0].inputUnits, 80);
  assert.equal(usage[0].outputUnits, 40);
  assert.equal(usage[0].status, "failed");
  assert.equal(usage[0].errorCode, "document_content_error");
});

test("文档结构不合格时按校验原因自修复一次，修好才落盘", async () => {
  const valid = JSON.stringify({
    schemaVersion: 1,
    title: "传统纹样教案",
    summary: "面向本科一年级的 45 分钟课程。",
    sections: [{ heading: "学习目标", paragraphs: ["理解连续纹样与单独纹样的区别。"], bullets: ["识别四种连续方式"] }],
  });
  const attempts: ModelRequest[] = [];
  let saved: unknown;
  const repository = {
    markRunning: async () => true,
    completeJob: async () => ({ id: "job-repair", status: "succeeded" }),
    createOutput: async (_id: string, artifact: unknown) => { saved = artifact; },
    recordUsage: async () => undefined,
  };
  const registry = { getForJob: () => ({ execute: async (request: ModelRequest) => {
    attempts.push(request);
    return attempts.length === 1
      // 概述写超 160 字且章节为空：正是线上最常见的两种不合格。
      ? { kind: "text" as const, content: JSON.stringify({ schemaVersion: 1, title: "传统纹样教案", summary: "长".repeat(200), sections: [] }), metadata: { inputTokens: 30, outputTokens: 18 } }
      : { kind: "text" as const, content: valid, metadata: { inputTokens: 45, outputTokens: 60 } };
  } }) };
  const exporter = {
    create: async () => ({ storageKey: "docx/key.docx", fileName: "传统纹样教案.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", fileSize: 2048 }),
    remove: async () => undefined,
  };
  const service = new GenerationService({} as never, repository as never, registry as never, exporter as never);
  service.createJob = async () => ({ id: "job-repair" } as GenerationJob);

  const result = await service.runJob(actor, { jobType: "document", prompt: "写一份教案", modelConfigId: "model", parameters: { outputFormat: "docx" } });

  assert.equal(attempts.length, 2);
  // 自修复请求必须带上具体失败原因，模型才知道要改哪里。
  assert.match(JSON.stringify(attempts[1].messages ?? []), /超出上限/);
  assert.equal(result.job.status, "succeeded");
  assert.equal(result.artifact?.fileName, "传统纹样教案.docx");
  assert.ok(saved);
});

test('临时执行仅保存任务摘要和计费，不保存提示词、上下文或成果文件',async()=>{
 let stored:any,request:any,captured=false;
 const repository={markRunning:async()=>({id:'temp-job'}),completeJob:async()=>({id:'temp-job',status:'succeeded'}),recordUsage:async()=>{},createOutput:async()=>{throw Error('temporary output must not persist');}};
 const models={getForJob:()=>({id:'mock-image',execute:async(input:any)=>{request=input;return {kind:'asset',content:'memory',mimeType:'image/png',metadata:{bytes:Buffer.from('png'),fileSize:3}};}})};
 const service=new GenerationService({} as never,repository as never,models as never);
 service.createJob=async(_actor,input)=>{stored=input;return {id:'temp-job'} as GenerationJob;};
 const result=await service.runJob(actor,{jobType:'image',prompt:'PRIVATE PROMPT',context:[{role:'user',content:'PRIVATE CONTEXT'}] as any,parameters:{}},undefined,{capture:async()=>{captured=true;return {fileName:'result.png',mimeType:'image/png',fileSize:3,downloadUrl:'/api/temporary-workflows/id/assets/a'};}});
 assert.equal(stored.prompt,'[temporary-workflow]');assert.deepEqual(stored.context,[]);assert.deepEqual(stored.parameters,{source:'temporary-workflow'});
 assert.equal(request.transient,true);assert.match(JSON.stringify(request.messages),/PRIVATE PROMPT/);assert.equal(captured,true);assert.match(result.artifact!.downloadUrl,/temporary-workflows/);
});
test("同步创作完成后返回模型正文并记录 token 用量", async () => {
  const queuedJob: GenerationJob = {
    id: "job-deepseek-test",
    userId: actor.id,
    jobType: "chat",
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
      capabilities: ["chat"],
      execute: async (request: ModelRequest) => {
        invocation = request;
        return { kind: "text" as const, content: "可执行的视觉创作方案", metadata: { inputTokens: 21, outputTokens: 34 } };
      },
    }),
  };
  const service = new GenerationService({} as never, repository as never, registry as never);
  service.createJob = async () => queuedJob;

  const result = await service.runJob(actor, {
    jobType: "chat",
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
