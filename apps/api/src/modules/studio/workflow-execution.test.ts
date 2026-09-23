import assert from "node:assert/strict";
import test from "node:test";
import { StudioService } from "./studio.service";

const actor = { id: "student-a", username: "student-a", displayName: "学生", roles: ["student"], accountStatus: "active" } as any;

test("连接的节点调用文本模型，结果持久化并可继续查看", async () => {
  const calls: Array<Record<string, any>> = [];
  const definition = {
    schemaVersion: 2,
    nodes: [
      { id: "input", type: "input", data: { label: "输入" }, position: { x: 0, y: 0 } },
      { id: "prompt", type: "prompt", data: { label: "方向", value: "请写一段设计说明" }, position: { x: 200, y: 0 } },
      { id: "generate", type: "text_generate", data: { label: "生成文字" }, position: { x: 400, y: 0 } },
      { id: "preview", type: "preview", data: { label: "预览" }, position: { x: 600, y: 0 } },
    ],
    edges: [
      { id: "e1", source: "input", target: "prompt" },
      { id: "e2", source: "prompt", target: "generate" },
      { id: "e3", source: "generate", target: "preview" },
    ],
    viewport: { x: 0, y: 0, zoom: 1 },
  };
  const row: Record<string, any> = {
    id: "run-a", user_id: actor.id, workflow_id: "flow-a", workflow_name: "设计说明",
    status: "in_progress", current_step: 0, total_steps: 4,
    context_json: { initialPrompt: "", initialSize: "1024x1024", size: "1024x1024", nodeResults: {}, nodeStates: {} },
    definition_json: definition,
  };
  const query = async (sql: string, values: any[] = []) => {
    if (sql.includes("SELECT r.*,w.name")) return { rows: [{ ...row }], rowCount: 1 };
    if (sql.includes("RETURNING id") && sql.includes("context_json=jsonb_set")) return { rows: [{ id: row.id }], rowCount: 1 };
    if (sql.includes("UPDATE workflow_runs SET context_json=$2")) {
      row.context_json = JSON.parse(values[1]);
      row.current_step = values[2];
      row.status = values[3];
      return { rows: [], rowCount: 1 };
    }
    return { rows: [], rowCount: 1 };
  };
  const database = { query, transaction: async (fn: (client: { query: typeof query }) => Promise<unknown>) => fn({ query }) };
  const generation = { runJob: async (_actor: unknown, input: Record<string, any>) => {
    calls.push(input);
    return { job: { id: "job-a" }, output: { content: "面向新生的视觉设计说明。" } };
  } };
  const models = { getForJob: () => ({ id: "model-deepseek" }) };
  const service = new StudioService(database as any, {} as any, generation as any, models as any);

  await service.executeRun(actor, row.id, { prompt: "传统纹样海报" });
  await service.executeRun(actor, row.id, {});
  await service.executeRun(actor, row.id, {});
  const result = await service.executeRun(actor, row.id, {});
  assert.equal(result.status, "completed");
  assert.equal(calls.length, 1);
  assert.match(calls[0].prompt, /传统纹样海报/);
  assert.match(calls[0].prompt, /请写一段设计说明/);
  assert.equal(result.context.nodeResults.generate.text, "面向新生的视觉设计说明。");
  assert.equal(result.context.nodeResults.preview.text, "面向新生的视觉设计说明。");
});

test("未接入真实 GPU 服务的节点不能发布", () => {
  const service = new StudioService({} as any, {} as any);
  assert.throws(() => (service as any).assertExecutableDefinition({
    nodes: [{ id: "x", type: "controlnet", data: { label: "ControlNet" } }], edges: [],
  }), /尚无真实执行服务/);
});

test("作者可试运行自己的草稿，其他用户不能读取未发布版本", async () => {
  const definition = { nodes: [
    { id: "input", type: "input", data: { label: "输入" } },
    { id: "preview", type: "preview", data: { label: "预览" } },
  ], edges: [{ source: "input", target: "preview" }] };
  const calls: Array<{ sql: string; values: any[] }> = [];
  const query = async (sql: string, values: any[] = []) => {
    calls.push({ sql, values });
    if (sql.includes("FROM workflows w") && sql.includes("latest.id AS version_id")) {
      return { rows: values[1] === actor.id ? [{ id: "draft-a", status: "draft", created_by: actor.id, version_id: "version-a", step_count: 2, definition_json: definition }] : [], rowCount: values[1] === actor.id ? 1 : 0 };
    }
    if (sql.includes("SELECT r.*,w.name")) return { rows: [{ id: "run-a", user_id: values[1], workflow_id: "draft-a", status: "in_progress", current_step: 0, total_steps: 2, context_json: { nodeResults: {}, nodeStates: {} }, definition_json: definition }], rowCount: 1 };
    return { rows: [], rowCount: 1 };
  };
  const database = { query, transaction: async (fn: (client: { query: typeof query }) => Promise<unknown>) => fn({ query }) };
  const service = new StudioService(database as any, {} as any);
  const started = await service.startWorkflow(actor, "draft-a", { context: { prompt: "测试", nodeResults: { fake: true } } } as any);
  assert.equal(started.workflowId, "draft-a");
  const insert = calls.find(({ sql }) => sql.includes("INSERT INTO workflow_runs"));
  assert.ok(insert);
  assert.equal(JSON.parse(insert.values[5]).nodeResults.fake, undefined);
  await assert.rejects(service.startWorkflow({ ...actor, id: "other-student" }, "draft-a", { context: {} } as any), /不存在或尚未发布/);
});

test("图像节点调用统一生成服务并持久化真实产物", async () => {
  const definition = { nodes: [
    { id: "input", type: "input", data: { label: "输入" } },
    { id: "sampler", type: "ksampler", data: { label: "生成图片" } },
    { id: "save", type: "save_image", data: { label: "保存" } },
  ], edges: [{ source: "input", target: "sampler" }, { source: "sampler", target: "save" }] };
  const row: Record<string, any> = { id: "run-image", user_id: actor.id, workflow_id: "flow-image", status: "in_progress", current_step: 0, total_steps: 3, context_json: { initialPrompt: "", initialSize: "1024x1024", size: "1024x1024", nodeResults: {}, nodeStates: {} }, definition_json: definition };
  const query = async (sql: string, values: any[] = []) => {
    if (sql.includes("SELECT r.*,w.name")) return { rows: [{ ...row }], rowCount: 1 };
    if (sql.includes("RETURNING id") && sql.includes("context_json=jsonb_set")) return { rows: [{ id: row.id }], rowCount: 1 };
    if (sql.includes("UPDATE workflow_runs SET context_json=$2")) { row.context_json = JSON.parse(values[1]); row.current_step = values[2]; row.status = values[3]; }
    return { rows: [], rowCount: 1 };
  };
  const inputs: any[] = [];
  const generation = { runJob: async (_actor: unknown, input: any) => { inputs.push(input); return { job: { id: "image-job" }, artifact: { id: "image-asset", downloadUrl: "/api/assets/image-asset" } }; } };
  const service = new StudioService({ query, transaction: async (fn: any) => fn({ query }) } as any, {} as any, generation as any, {} as any);
  await service.executeRun(actor, row.id, { prompt: "青绿色传统纹样海报" });
  await service.executeRun(actor, row.id, {});
  const result = await service.executeRun(actor, row.id, {});
  assert.equal(inputs[0].jobType, "image");
  assert.match(inputs[0].prompt, /青绿色传统纹样海报/);
  assert.equal(result.status, "completed");
  assert.equal(result.context.artifact.id, "image-asset");
  assert.equal(result.context.nodeResults.save.kind, "saved_asset");
});
