import assert from "node:assert/strict";
import test from "node:test";
import { StudioService } from "./studio.service";
import { workflowVersionInputSchema } from './studio.contracts';

test("工作流读取、预览和执行保留版本知识绑定，旧版本不推测工具", () => {
  const service = new StudioService({} as any, {} as any);
  const learning = { knowledgePoints: ["提示词"], tools: ["DeepSeek"], abilityGoals: ["比较方案"] };
  const definition = { schemaVersion: 2, nodes: [{ id: "n", type: "note", data: { label: "说明" } }], edges: [], learning };
  assert.deepEqual((service as any).normalizeWorkflowDefinition(definition).learning, learning);
  assert.deepEqual((service as any).normalizeWorkflowDefinition({ nodes: [], edges: [] }).learning, { knowledgePoints: [], tools: [], abilityGoals: [] });
});

test('工作流目录返回总数并支持翻页与检索，第 21 条之后仍有入口', async () => {
  const calls: { sql: string; values: any[] }[] = [];
  const database = {
    query: async (sql: string, values: any[] = []) => {
      calls.push({ sql, values });
      if (sql.includes('COUNT(*)')) return { rows: [{ total: 25 }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    },
  };
  const service = new StudioService(database as any, {} as any);
  const first = await service.listWorkflows({ page: 1, pageSize: 20 } as any, null);
  assert.equal(first.total, 25, '目录必须知道总条数，才能显示「加载更多」');
  const second = await service.listWorkflows({ page: 2, pageSize: 20 } as any, null);
  assert.equal(second.total, 25);
  const paged = calls.filter((call) => call.sql.includes('LIMIT')).at(-1)!;
  assert.deepEqual(paged.values, [20, 20], '第二页的 LIMIT/OFFSET 必须是 20/20');
  const searched = await service.listWorkflows({ query: '海报', page: 1, pageSize: 20 } as any, null);
  assert.equal(searched.total, 25);
  const [countSql, pageSql] = calls.slice(-2);
  assert.ok(countSql.sql.includes('COUNT(*)'), '总数查询不能带 LIMIT，否则分页会把总数算错');
  assert.deepEqual(countSql.values, ['%海报%'], '总条数与当前页必须用同一个检索条件');
  assert.deepEqual(pageSql.values, ['%海报%', 20, 0]);
});

const actor = { id: "student-a", username: "student-a", displayName: "学生", roles: ["student"], accountStatus: "active" } as any;

const graphNode = (id: string, type: string, value = '') => ({ id, type, position: { x: 0, y: 0 }, data: { label: id, value } });
const graphEdge = (source: string, target: string) => ({ id: `${source}-${target}`, source, target });

test('ComfyUI 离线交换源数据通过服务端契约与读取归一化后仍完整保留',()=>{
 const source={version:1,nodes:[{id:1,type:'Plugin',widgets_values:['opaque'],properties:{plugin:'keep'}}],links:[],definitions:{subgraphs:[{id:'nested'}]},extra:{custom:true}};
 const definition={engine:'comfyui',nodes:[{id:'1',type:'comfy',position:{x:10,y:20},data:{label:'插件',classType:'Plugin',widgets:{},comfyUI:source.nodes[0]}}],edges:[],comfyExchange:{format:'ui',source,edges:[],groups:[],collapsedReroutes:['reroute-1']}};
 const parsed=workflowVersionInputSchema.parse({publish:false,definition}).definition!;
 const normalized=(new StudioService({} as any,{} as any) as any).normalizeWorkflowDefinition(JSON.parse(JSON.stringify(parsed)));
 assert.deepEqual(normalized.comfyExchange.source,source);
 assert.deepEqual(normalized.comfyExchange.collapsedReroutes,['reroute-1']);
 assert.deepEqual(normalized.nodes[0].data.comfyUI.properties,{plugin:'keep'});
});

test('图片输入的原图和遮罩沿分支传到图片编辑 API，产物继续预览保存',async()=>{
 const definition={nodes:[graphNode('image','load_image'),graphNode('prompt','prompt','改变选区颜色'),graphNode('generate','ksampler'),graphNode('out','save_image')],edges:[graphEdge('image','prompt'),graphEdge('prompt','generate'),graphEdge('generate','out')]};
 const calls:any[]=[];
 const f=executionFixture(definition,{runJob:async(_actor:any,input:any)=>{calls.push(input);return {job:{id:'edit'},artifact:{id:'edited',downloadUrl:'/private/edited.png'}};}});
 await f.service.executeRun(actor,f.row.id,{referenceFileId:'private-original',maskFileId:'private-mask'});
 await f.finish();
 assert.equal(calls.length,1);assert.equal(calls[0].parameters.referenceFileId,'private-original');assert.equal(calls[0].parameters.maskFileId,'private-mask');
 assert.equal(f.row.context_json.artifact.downloadUrl,'/private/edited.png');
});
function executionFixture(definition: any, generation?: any, models?: any) {
  const row: any = { id: 'regression-run', user_id: actor.id, status: 'in_progress', current_step: 0, total_steps: definition.nodes.length, definition_json: definition,
    context_json: { initialPrompt: '', initialSize: '1024x1024', nodeResults: {}, nodeStates: {} } };
  const query = async (sql: string, values: any[] = []) => {
    if (sql.includes('SELECT r.*,w.name')) return { rows: [structuredClone(row)], rowCount: 1 };
    if (sql.includes('context_json=jsonb_set')) {
      if (row.context_json.executing || row.current_step !== values[2]) return { rows: [], rowCount: 0 };
      row.context_json.executing = { step: row.current_step };
      return { rows: [{ id: row.id }], rowCount: 1 };
    }
    if (sql.includes('UPDATE workflow_runs SET context_json=$2')) { row.context_json = JSON.parse(values[1]); row.current_step = values[2]; row.status = values[3]; }
    if (sql.includes("context_json=context_json-'executing'")) delete row.context_json.executing;
    return { rows: [], rowCount: 1 };
  };
  const service = new StudioService({ query, transaction: async (fn: any) => fn({ query }) } as any, {} as any, generation, models);
  return { row, service, finish: async () => { while (row.status === 'in_progress') await service.executeRun(actor, row.id, {}); return service.getWorkflowRun(actor, row.id); } };
}

test('正负提示词并行合并，不依赖连线顺序、不重复共同输入，也不把负向词送进正向', async () => {
  for (const reverse of [false, true]) {
    const parents = [graphEdge('a', 'merge'), graphEdge('b', 'merge'), graphEdge('negative', 'merge')];
    const definition = workflowVersionInputSchema.parse({ definition: {
      nodes: [graphNode('input', 'input', '海报'), graphNode('a', 'prompt', '红色'), graphNode('b', 'prompt', '圆形'), graphNode('negative', 'negative_prompt', '水印'), graphNode('merge', 'prompt_merge'), graphNode('generate', 'ksampler'), graphNode('out', 'save_image')],
      edges: [graphEdge('input', 'a'), graphEdge('input', 'b'), ...(reverse ? parents.reverse() : parents), graphEdge('merge', 'generate'), graphEdge('generate', 'out')],
    } }).definition!;
    const calls: any[] = [];
    const generation = { runJob: async (_actor: any, input: any) => { calls.push(input); return { job: { id: 'job' }, artifact: { id: 'image' } }; } };
    const f = executionFixture(definition, generation);
    f.row.context_json.initialPrompt = '用户需求海报';
    (f.service as any).assertExecutableDefinition(definition);
    const result = await f.finish();
    assert.equal(result.status, 'completed');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].prompt.split('海报').length - 1, 1);
    assert.equal(calls[0].prompt.split('用户需求').length - 1, 1);
    for (const text of ['红色', '圆形']) assert.ok(calls[0].prompt.includes(text));
    assert.ok(!calls[0].prompt.includes('水印'));
    assert.equal(calls[0].parameters.negativePrompt, '水印');
  }
});

test('说明节点从进度接口完成后，下游仍能读取数据', async () => {
  const f = executionFixture({ nodes: [graphNode('input', 'input', '海报'), graphNode('note', 'note', '说明'), graphNode('out', 'preview')], edges: [graphEdge('input', 'note'), graphEdge('note', 'out')] });
  await f.service.executeRun(actor, f.row.id, {});
  await f.service.updateRun(actor, f.row.id, { stepIndex: 1, action: 'complete' });
  const result = await f.finish();
  assert.equal(result.context.nodeResults.out.text, '海报');
});

test('发布前拒绝没有图片来源的保存节点和空提示词', () => {
  const service = new StudioService({} as any, {} as any) as any;
  assert.throws(() => service.assertExecutableDefinition({ nodes: [graphNode('in', 'input'), graphNode('out', 'save_image')], edges: [graphEdge('in', 'out')] }), /图片生成节点/);
  assert.throws(() => service.assertExecutableDefinition({ nodes: [graphNode('prompt', 'prompt'), graphNode('out', 'preview')], edges: [graphEdge('prompt', 'out')] }), /需要填写/);
});

test('分支显式尺寸覆盖继承的默认尺寸，两个显式尺寸冲突时拒绝执行', async () => {
  const make = (secondSize: string) => executionFixture({ nodes: [graphNode('input', 'input', '海报'), graphNode('a', 'empty_latent', '512x512'), graphNode('b', 'empty_latent', secondSize), graphNode('out', 'preview')], edges: [graphEdge('input', 'a'), graphEdge('input', 'b'), graphEdge('a', 'out'), graphEdge('b', 'out')] });
  const okay = await make('').finish();
  assert.equal(okay.context.size, '512x512');
  await assert.rejects(make('768x768').finish(), /图片尺寸冲突/);
});

test('默认模型节点清除显式覆盖，并压过祖先分支保留的旧模型', async () => {
  const definition = { nodes: [graphNode('input', 'input', '海报'), graphNode('old', 'model', 'old-model'), graphNode('default', 'model'), graphNode('out', 'preview')], edges: [graphEdge('input', 'old'), graphEdge('old', 'default'), graphEdge('old', 'out'), graphEdge('default', 'out')] };
  const result = await executionFixture(definition).finish();
  assert.equal(result.context.modelConfigId, undefined);
  assert.equal(result.context.nodeResults.default.modelConfigId, 'internal-default');
});

test('文字生成的结果可作为下一步生图提示词', async () => {
  const calls: any[] = [];
  const generation = { runJob: async (_actor: any, input: any) => { calls.push(input); return input.jobType === 'chat' ? { job: { id: 'text' }, output: { content: '模型扩写后的具体构图' } } : { job: { id: 'image' }, artifact: { id: 'image' } }; } };
  const definition = { nodes: [graphNode('input', 'input', '原始主题'), graphNode('text', 'text_generate'), graphNode('image', 'ksampler'), graphNode('out', 'save_image')], edges: [graphEdge('input', 'text'), graphEdge('text', 'image'), graphEdge('image', 'out')] };
  await executionFixture(definition, generation, { getForJob: () => ({ id: 'chat-model' }) }).finish();
  assert.equal(calls[1].prompt, '模型扩写后的具体构图');
});

test('同一个生成节点并发执行只会调用一次模型', async () => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let calls = 0;
  const generation = { runJob: async () => { calls++; await gate; return { job: { id: 'job' }, artifact: { id: 'image' } }; } };
  const f = executionFixture({ nodes: [graphNode('in', 'input', '海报'), graphNode('generate', 'ksampler'), graphNode('out', 'save_image')], edges: [graphEdge('in', 'generate'), graphEdge('generate', 'out')] }, generation);
  await f.service.executeRun(actor, f.row.id, {});
  const first = f.service.executeRun(actor, f.row.id, {});
  await new Promise(resolve => setImmediate(resolve));
  try { await assert.rejects(f.service.executeRun(actor, f.row.id, {}), /正在执行/); } finally { release(); }
  await first;
  assert.equal(calls, 1);
});

test('过期的未完成任务返回已结束状态，不能继续执行', async () => {
  const f = executionFixture({ nodes: [graphNode('input', 'input', '海报'), graphNode('out', 'preview')], edges: [graphEdge('input', 'out')] });
  f.row.started_at = new Date(Date.now() - 21 * 60 * 1000).toISOString();
  const result = await f.service.getWorkflowRun(actor, f.row.id);
  assert.equal(result.expired, true);
  assert.equal(result.status, 'cancelled');
  assert.deepEqual(result.context, {});
  await assert.rejects(f.service.executeRun(actor, f.row.id, {}), /过期/);
});

test('文本常量、精确替换、模板、正向转换、转接与文字预览可组成完整链路', async () => {
  const definition = workflowVersionInputSchema.parse({ definition: {
    nodes: [graphNode('text', 'text_constant', '  模糊.*海报  '), { ...graphNode('replace', 'text_replace'), data: { label: '替换', find: '.*', replacement: '$&清晰' } }, graphNode('template', 'text_template', '主题：{text}'), graphNode('prompt', 'text_to_prompt'), graphNode('reroute', 'reroute'), graphNode('preview', 'text_preview')],
    edges: [graphEdge('text', 'replace'), graphEdge('replace', 'template'), graphEdge('template', 'prompt'), graphEdge('prompt', 'reroute'), graphEdge('reroute', 'preview')],
  } }).definition!;
  const f = executionFixture(definition);
  (f.service as any).assertExecutableDefinition(definition);
  const result = await f.finish();
  assert.equal(result.context.nodeResults.text.text, '  模糊.*海报  ');
  assert.equal(result.context.nodeResults.replace.text, '  模糊$&清晰海报  ');
  assert.equal(result.context.text, '主题：  模糊$&清晰海报');
});

test('文本拼接按 A、B 端口排序，保持重复文字，支持空分隔符', async () => {
  const definition = { nodes: [graphNode('a', 'text_constant', '甲'), graphNode('b', 'text_constant', '甲'), { ...graphNode('join', 'text_join'), data: { label: '拼接', separator: '' } }, graphNode('out', 'text_preview')], edges: [{ ...graphEdge('b', 'join'), targetHandle: 'b' }, { ...graphEdge('a', 'join'), targetHandle: 'a' }, graphEdge('join', 'out')] };
  const f = executionFixture(definition);
  (f.service as any).assertExecutableDefinition(definition);
  assert.equal((await f.finish()).context.text, '甲甲');
});

test('文字转负向与文字转正向汇合后可以生图，不携带相互冲突的原始文字', async () => {
  let input: any;
  const generation = { runJob: async (_actor: any, job: any) => { input = job; return { job: { id: 'job' }, artifact: { id: 'image' } }; } };
  const definition = { nodes: [graphNode('p', 'text_constant', '青绿色海报'), graphNode('n', 'text_constant', '文字、水印'), graphNode('positive', 'text_to_prompt'), graphNode('negative', 'text_to_negative'), graphNode('merge', 'prompt_merge'), graphNode('image', 'ksampler'), graphNode('save', 'save_image')], edges: [graphEdge('p', 'positive'), graphEdge('n', 'negative'), { ...graphEdge('positive', 'merge'), targetHandle: 'positive' }, { ...graphEdge('negative', 'merge'), targetHandle: 'negative' }, graphEdge('merge', 'image'), graphEdge('image', 'save')] };
  const f = executionFixture(definition, generation);
  (f.service as any).assertExecutableDefinition(definition);
  await f.finish();
  assert.equal(input.prompt, '青绿色海报');
  assert.equal(input.parameters.negativePrompt, '文字、水印');
});

test('结果选择采用指定端口完整图片结果，跳过未选择分支的模型执行', async () => {
  const calls: string[] = [];
  const generation = { runJob: async (_actor: any, input: any) => { calls.push(input.prompt); return { job: { id: input.prompt }, artifact: { id: `image-${input.prompt}` } }; } };
  const definition = { nodes: [graphNode('a', 'input', '方案A'), graphNode('b', 'input', '方案B'), graphNode('ga', 'ksampler'), graphNode('gb', 'ksampler'), { ...graphNode('choose', 'result_select'), data: { label: '选择', selection: 'b' } }, graphNode('out', 'save_image')], edges: [graphEdge('a', 'ga'), graphEdge('b', 'gb'), { ...graphEdge('ga', 'choose'), targetHandle: 'a' }, { ...graphEdge('gb', 'choose'), targetHandle: 'b' }, graphEdge('choose', 'out')] };
  const f = executionFixture(definition, generation);
  (f.service as any).assertExecutableDefinition(definition);
  const result = await f.finish();
  assert.deepEqual(calls, ['方案B']);
  assert.equal(result.context.nodeResults.ga.kind, 'skipped');
  assert.equal(result.context.artifact.id, 'image-方案B');
  assert.equal(result.context.nodeResults.choose.sourceNodeId, 'gb');
});

test('模板在发布和执行时都检查缺失数据，未知占位符不能静默保留', async () => {
  const make = (value: string) => executionFixture({ nodes: [graphNode('template', 'text_template', value), graphNode('out', 'text_preview')], edges: [graphEdge('template', 'out')] });
  const missing = make('{text}');
  assert.throws(() => (missing.service as any).assertExecutableDefinition(missing.row.definition_json), /缺少上游数据/);
  await assert.rejects(missing.finish(), /缺少上游数据/);
  const invalid = make('{unknown}');
  assert.throws(() => (invalid.service as any).assertExecutableDefinition(invalid.row.definition_json), /仅支持/);
  await assert.rejects(invalid.finish(), /仅支持/);
});

test('新增节点拒绝不存在的输入、重复端口和错误参数类型，草稿可缺少输入', () => {
  const base = { nodes: [graphNode('a', 'text_constant', '甲'), graphNode('b', 'text_constant', '乙'), graphNode('join', 'text_join')], edges: [] as any[] };
  assert.equal(workflowVersionInputSchema.safeParse({ definition: base }).success, true);
  for (const edges of [[graphEdge('a', 'b')], [{ ...graphEdge('a', 'join'), targetHandle: 'wrong' }], [{ ...graphEdge('a', 'join'), targetHandle: 'a' }, { ...graphEdge('b', 'join'), targetHandle: 'a' }]]) assert.equal(workflowVersionInputSchema.safeParse({ definition: { ...base, edges } }).success, false);
  assert.equal(workflowVersionInputSchema.safeParse({ definition: { nodes: [{ ...graphNode('select', 'result_select'), data: { label: '选择', selection: 'c' } }], edges: [] } }).success, false);
});

test('文本处理结果超过上限时停止，不将无限扩大的数据传给模型', async () => {
  const f = executionFixture({ nodes: [graphNode('a', 'text_constant', '甲'.repeat(6000)), graphNode('b', 'text_constant', '乙'.repeat(6000)), graphNode('join', 'text_join'), graphNode('out', 'text_preview')], edges: [{ ...graphEdge('a', 'join'), targetHandle: 'a' }, { ...graphEdge('b', 'join'), targetHandle: 'b' }, graphEdge('join', 'out')] });
  await assert.rejects(f.finish(), /10000/);
});

test('原生未连接草稿可离线保存，发布仍强制真实Worker校验并移除客户端prompt', async () => {
 const saved:any[]=[];
 const query=async(sql:string,values:any[]=[])=>{
   if(sql.includes('SELECT created_by'))return {rows:[{created_by:actor.id}]};
   if(sql.includes('MAX(version_number)'))return {rows:[{number:1}]};
   if(sql.includes('INSERT INTO workflow_versions'))saved.push(JSON.parse(values[3]));
   return {rows:[]};
 };
 const database={query,transaction:async(fn:any)=>fn({query})};
 const service=new StudioService(database as any,{requireAnyRole:()=>{}} as any);
 const definition:any={engine:'comfyui',schemaVersion:2,nodes:[{id:'n',type:'comfy',position:{x:0,y:0},data:{label:'采样',classType:'KSampler',widgets:{seed:1}}}],edges:[],comfyPrompt:{fake:{class_type:'Injected',inputs:{}}}};
 await service.createWorkflowVersion(actor,'flow-a',{definition:structuredClone(definition),publish:false});
 assert.equal(saved.length,1);assert.equal(saved[0].comfyPrompt,undefined);
 await assert.rejects(()=>service.createWorkflowVersion(actor,'flow-a',{definition:structuredClone(definition),publish:true}),/执行服务/);
 assert.equal(saved.length,1);
});

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

test("输入节点配了默认值时，不填需求也能直接跑起来", async () => {
  const definition = { nodes: [
    { id: "input", type: "input", data: { label: "创作需求", value: "青绿色传统纹样海报" } },
    { id: "preview", type: "preview", data: { label: "预览" } },
  ], edges: [{ source: "input", target: "preview" }] };
  const row: Record<string, any> = { id: "run-default", user_id: actor.id, workflow_id: "flow-default", status: "in_progress", current_step: 0, total_steps: 2, context_json: { initialPrompt: "", initialSize: "1024x1024", size: "1024x1024", trialRun: true, nodeResults: {}, nodeStates: {} }, definition_json: definition };
  const query = async (sql: string, values: any[] = []) => {
    if (sql.includes("SELECT r.*,w.name")) return { rows: [{ ...row }], rowCount: 1 };
    if (sql.includes("RETURNING id") && sql.includes("context_json=jsonb_set")) return { rows: [{ id: row.id }], rowCount: 1 };
    if (sql.includes("UPDATE workflow_runs SET context_json=$2")) { row.context_json = JSON.parse(values[1]); row.current_step = values[2]; row.status = values[3]; }
    return { rows: [], rowCount: 1 };
  };
  const service = new StudioService({ query, transaction: async (fn: any) => fn({ query }) } as any, {} as any);
  const first = await service.executeRun(actor, row.id, {});
  assert.equal(first.context.nodeResults.input.prompt, "青绿色传统纹样海报");
  const second = await service.executeRun(actor, row.id, {});
  assert.equal(second.status, "completed");
  assert.equal(second.context.nodeResults.preview.text, "青绿色传统纹样海报");
});

test("创作需求留空也不算错：提示词由链路里写好的 prompt 节点补上", async () => {
  const definition = { nodes: [
    { id: "input", type: "input", data: { label: "创作需求" } },
    { id: "positive", type: "prompt", data: { label: "正向提示词", value: "艺术教育插画风格，柔和自然光" } },
    { id: "negative", type: "negative_prompt", data: { label: "负向提示词", value: "文字、水印" } },
    { id: "preview", type: "preview", data: { label: "预览" } },
  ], edges: [
    { source: "input", target: "positive" }, { source: "positive", target: "negative" }, { source: "negative", target: "preview" },
  ] };
  const row: Record<string, any> = { id: "run-blank", user_id: actor.id, workflow_id: "flow-blank", status: "in_progress", current_step: 0, total_steps: 4, context_json: { initialPrompt: "", initialSize: "1024x1024", size: "1024x1024", nodeResults: {}, nodeStates: {} }, definition_json: definition };
  const query = async (sql: string, values: any[] = []) => {
    if (sql.includes("SELECT r.*,w.name")) return { rows: [{ ...row }], rowCount: 1 };
    if (sql.includes("RETURNING id") && sql.includes("context_json=jsonb_set")) return { rows: [{ id: row.id }], rowCount: 1 };
    if (sql.includes("UPDATE workflow_runs SET context_json=$2")) { row.context_json = JSON.parse(values[1]); row.current_step = values[2]; row.status = values[3]; }
    return { rows: [], rowCount: 1 };
  };
  const service = new StudioService({ query, transaction: async (fn: any) => fn({ query }) } as any, {} as any);
  // 什么都不填，一路按「执行当前节点」走下去，应该自己用上节点里写好的提示词。
  for (let step = 0; step < 3; step += 1) await service.executeRun(actor, row.id, {});
  const result = await service.executeRun(actor, row.id, {});
  assert.equal(result.status, "completed");
  assert.equal(result.context.nodeResults.input.prompt, "");
  assert.match(result.context.nodeResults.positive.prompt, /艺术教育插画风格/);
  assert.equal(result.context.nodeResults.negative.negativePrompt, "文字、水印");
  assert.match(result.context.nodeResults.preview.text, /艺术教育插画风格/);
});

test("试运行会标明跑的是草稿还是已发布版本", async () => {
  const definition = { nodes: [
    { id: "input", type: "input", data: { label: "输入" } },
    { id: "preview", type: "preview", data: { label: "预览" } },
  ], edges: [{ source: "input", target: "preview" }] };
  const start = async (publishedAt: Date | null) => {
    let inserted: any[] = [];
    const query = async (sql: string, values: any[] = []) => {
      if (sql.includes("FROM workflows w") && sql.includes("latest.id AS version_id")) {
        return { rows: [{ id: "flow-a", status: publishedAt ? "published" : "draft", created_by: actor.id, version_id: "version-a", version_number: 4, published_at: publishedAt, step_count: 2, definition_json: definition }], rowCount: 1 };
      }
      if (sql.includes("INSERT INTO workflow_runs")) { inserted = values; return { rows: [], rowCount: 1 }; }
      if (sql.includes("SELECT r.*,w.name")) return { rows: [{ id: inserted[0], user_id: actor.id, workflow_id: "flow-a", workflow_version_id: "version-a", status: "in_progress", current_step: 0, total_steps: 2, context_json: JSON.parse(inserted[5]), definition_json: definition, version_number: 4, published_at: publishedAt }], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    };
    const service = new StudioService({ query, transaction: async (fn: any) => fn({ query }) } as any, {} as any);
    return service.startWorkflow(actor, "flow-a", { context: {} } as any) as Promise<any>;
  };

  // 未发布：作者可以试运行，记录里必须能看出「这一版还没发布」。
  const draft = await start(null);
  assert.equal(draft.versionPublished, false);
  assert.equal(draft.trialRun, true);
  assert.equal(draft.context.trialRun, true);
  assert.equal(draft.versionNumber, 4);

  // 已发布：同样的入口跑的就不再是试运行。
  const published = await start(new Date());
  assert.equal(published.versionPublished, true);
  assert.equal(published.trialRun, false);
});

test("图像节点调用统一生成服务并持久化真实产物", async () => {
  const definition = { nodes: [
    { id: "input", type: "input", data: { label: "输入" } },
    { id: "positive", type: "prompt", data: { label: "正向提示词", value: "画面主体明确，构图清晰" } },
    { id: "negative", type: "negative_prompt", data: { label: "负向提示词", value: "水印、模糊" } },
    { id: "sampler", type: "ksampler", data: { label: "生成图片" } },
    { id: "save", type: "save_image", data: { label: "保存" } },
  ], edges: [{ source: "input", target: "positive" }, { source: "positive", target: "negative" }, { source: "negative", target: "sampler" }, { source: "sampler", target: "save" }] };
  const row: Record<string, any> = { id: "run-image", user_id: actor.id, workflow_id: "flow-image", status: "in_progress", current_step: 0, total_steps: 5, context_json: { initialPrompt: "", initialSize: "1024x1024", size: "1024x1024", nodeResults: {}, nodeStates: {} }, definition_json: definition };
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
  await service.executeRun(actor, row.id, { negativePrompt: "文字、水印" });
  await service.executeRun(actor, row.id, {});
  const result = await service.executeRun(actor, row.id, {});
  assert.equal(inputs[0].jobType, "image");
  assert.match(inputs[0].prompt, /青绿色传统纹样海报/);
  assert.match(inputs[0].prompt, /画面主体明确/);
  assert.doesNotMatch(inputs[0].prompt, /水印/);
  assert.equal(inputs[0].parameters.negativePrompt, "文字、水印");
  assert.equal(result.status, "completed");
  assert.equal(result.context.artifact.id, "image-asset");
  assert.equal(result.context.nodeResults.negative.negativePrompt, "文字、水印");
  assert.equal(result.context.nodeResults.save.kind, "saved_asset");
});


test('动态条件只运行匹配分支，失败路由不会执行正常下游', async () => {
  const node = {...graphNode('condition','condition','红'),data:{label:'条件',field:'prompt',operator:'contains',value:'红'}};
  const definition={nodes:[graphNode('source','prompt','红色'),node,graphNode('yes','ksampler'),graphNode('no','ksampler'),graphNode('done','preview')],edges:[graphEdge('source','condition'),{...graphEdge('condition','yes'),sourceHandle:'true'},{...graphEdge('condition','no'),sourceHandle:'false'},graphEdge('yes','done'),graphEdge('no','done')]};
  const calls:any[]=[];
  const f=executionFixture(definition,{runJob:async (_:any,input:any)=>{calls.push(input);return {job:{id:'generated'},artifact:{id:'image'}};}});
  const result=await f.finish();assert.equal(calls.length,1);assert.equal(result.context.nodeResults.no.kind,'skipped');assert.equal(result.context.nodeResults.yes.kind,'generation');
  const failure={nodes:[graphNode('source','prompt','海报'),graphNode('generate','ksampler'),graphNode('normal','save_image'),graphNode('recover','text_preview')],edges:[graphEdge('source','generate'),graphEdge('generate','normal'),{...graphEdge('generate','recover'),sourceHandle:'error'}]};
  const failed=executionFixture(failure,{runJob:async()=>{throw Error('供应商失败');}});
  const recovered=await failed.finish();assert.equal(recovered.context.nodeResults.generate.kind,'failed');assert.equal(recovered.context.nodeResults.normal.kind,'skipped');assert.equal(recovered.context.nodeResults.recover.text,'供应商失败');
});

test('有界循环支持模板、提前终止并拒绝无界参数', async () => {
  const loop={...graphNode('loop','loop','{text}-{index}'),data:{label:'循环',operation:'text_template',iterations:5,value:'{text}-{index}',until:'-2'}};
  const definition={nodes:[graphNode('source','text_constant','开始'),loop,graphNode('out','text_preview')],edges:[graphEdge('source','loop'),graphEdge('loop','out')]};
  const f=executionFixture(definition);(f.service as any).assertExecutableDefinition(definition);
  const result=await f.finish();assert.equal(result.context.text,'开始-1-2');assert.equal(result.context.nodeResults.loop.iterations,2);
  assert.equal(workflowVersionInputSchema.safeParse({definition:{...definition,nodes:[{...loop,data:{...loop.data,iterations:21}}]}}).success,false);
});
