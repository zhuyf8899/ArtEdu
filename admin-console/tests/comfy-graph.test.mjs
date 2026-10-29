import test from 'node:test';
import assert from 'node:assert/strict';
import { compilePrompt, importComfy, exportComfyApi, exportComfyUI, readComfyWorkflowFile, nodeFromInfo, ports, validateGraphStructure, validConnection } from '../src/comfyGraph.js';
import { deflateSync } from 'node:zlib';
const catalog = { Source: { input: { required: { seed: ['INT', { default: 1, min: 0 }], text: ['STRING', { default: 'hello', multiline: true }] } }, output: ['LATENT'], output_name: ['latent'] }, Output: { input: { required: { latent: ['LATENT', {}] } }, output: [], output_node: true }, Custom: { input: { required: { mode: [['a', 'b'], {}] } }, output: ['IMAGE'] } };
const prompt = { '1': { class_type: 'Source', inputs: { seed: 7, text: 'flower' } }, '2': { class_type: 'Output', inputs: { latent: ['1', 0] } } };
test('Numeric defaults respect bounds and invalid parameters fail before submission', () => {
    const info = { input: { required: { width: ['INT', { min: 64, max: 8192 }] } } };
    assert.equal(nodeFromInfo('x', 'Size', info, {}).data.widgets.width, 64);
    for (const value of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1, NaN]) {
        const graph = importComfy(prompt, catalog);
        graph.nodes[0].data.widgets.seed = value;
        assert.throws(() => compilePrompt(graph, catalog), /参数无效/);
    }
});
test('UI Reroute chains preserve source slots and fan-out, reject cycles and missing inputs', () => {
    const raw = { nodes: [
        { id: 1, type: 'Source', widgets_values: [7, 'flower'] },
        { id: 2, type: 'Reroute' }, { id: 3, type: 'Reroute' },
        { id: 4, type: 'Output', widgets_values: [], inputs: [{ name: 'latent' }] },
        { id: 5, type: 'Output', widgets_values: [], inputs: [{ name: 'latent' }] }
    ], links: [[1, 1, 0, 2, 0], [2, 2, 0, 3, 0], [3, 3, 0, 4, 0], [4, 2, 0, 5, 0]] };
    const graph = importComfy(raw, catalog);
    assert.equal(graph.nodes.length, 3);
    const compiled = compilePrompt(graph, catalog);
    assert.deepEqual(compiled['4'].inputs.latent, ['1', 0]);
    assert.deepEqual(compiled['5'].inputs.latent, ['1', 0]);
    const broken = structuredClone(raw); broken.links.shift();
    assert.throws(() => importComfy(broken, catalog), /一条输入/);
    const cyclic = structuredClone(raw); cyclic.links[0][1] = 3;
    assert.throws(() => importComfy(cyclic, catalog), /循环/);
});
test('Comfy API import/export preserves typed links and widget values', () => { const graph = importComfy(prompt, catalog); const restored = compilePrompt(graph, catalog); assert.deepEqual(restored['1'].inputs, prompt['1'].inputs); assert.deepEqual(restored['2'].inputs, prompt['2'].inputs); assert.equal(graph.edges[0].targetHandle, 'latent'); });
test('Dynamic custom nodes use actual metadata and enum defaults', () => { const node = nodeFromInfo('c', 'Custom', catalog.Custom, { x: 1, y: 2 }); assert.equal(node.data.widgets.mode, 'a'); assert.deepEqual(ports(catalog.Source).outputs, [{ name: '0', type: 'LATENT', label: 'latent' }]); });
test('Reject mismatched type, duplicate input and cycles', () => { const g = importComfy(prompt, catalog); const wrong = structuredClone(catalog); wrong.Source.output = ['IMAGE']; assert.throws(() => compilePrompt(g, wrong), /端口类型/); const duplicate = importComfy(prompt, catalog); duplicate.edges.push({ ...duplicate.edges[0], id: 'duplicate' }); assert.throws(() => compilePrompt(duplicate, catalog), /只能有一条/); const cycle = importComfy(prompt, catalog); cycle.edges.push({ id: 'cycle', source: '2', target: '1', sourceHandle: '0', targetHandle: 'seed' }); assert.throws(() => compilePrompt(cycle, catalog), /循环/); });
test('UI workflow mapping is strict and never silently imports an unrelated default graph', () => { const raw = { nodes: [{ id: 1, type: 'Source', pos: [10, 20], widgets_values: [7, 'flower'], inputs: [{ name: 'seed', widget: { name: 'seed' } }, { name: 'text', widget: { name: 'text' } }] }, { id: 2, type: 'Output', pos: [100, 20], widgets_values: [], inputs: [{ name: 'latent' }] }], links: [[1, 1, 0, 2, 0, 'LATENT']] }; assert.deepEqual(compilePrompt(importComfy(raw, catalog), catalog)['2'].inputs, { latent: ['1', 0] }); raw.nodes[0].widgets_values.push('randomize'); assert.throws(() => importComfy(raw, catalog), /控件顺序/); assert.throws(() => importComfy({ garbage: 123 }, catalog), /缺少节点定义/); });

test('One converted widget does not discard remaining UI widget values; groups survive import', () => {
    const raw = { nodes: [{ id: 1, type: 'Source', pos: [10,20], widgets_values: [7,'flower'], inputs: [{ name:'seed', widget:{name:'seed'} }] }, {id:2,type:'Output',pos:[100,20],widgets_values:[],inputs:[{name:'latent'}]}], links:[[1,1,0,2,0]],groups:[{title:'生成链',bounding:[0,0,400,400],color:'#123456'}] };
    const graph=importComfy(raw,catalog);
    assert.deepEqual(compilePrompt(graph,catalog)['1'].inputs,{seed:7,text:'flower'});
    assert.deepEqual(graph.groups[0].nodeIds,['1','2']);
});
test('Actual metadata order and control_after_generate map UI widgets without shifting parameters', () => {
    const info={...catalog.Source,input_order:{required:['text','seed']},input:{required:{seed:['INT',{default:1,control_after_generate:true}],text:['STRING',{}]}}};
    const graph=importComfy({nodes:[{id:1,type:'Source',widgets_values:['flower',42,'randomize']},{id:2,type:'Output',widgets_values:[],inputs:[{name:'latent'}]}],links:[[1,1,0,2,0]]},{...catalog,Source:info});
    assert.deepEqual(compilePrompt(graph,{...catalog,Source:info})['1'].inputs,{text:'flower',seed:42});
});
test('Drafts allow missing inputs but reject duplicate IDs, dangling links and cycles', () => {
    const graph=importComfy(prompt,catalog);graph.edges=[];
    assert.doesNotThrow(()=>validateGraphStructure(graph));
    assert.throws(()=>compilePrompt(graph,catalog),/缺少输入/);
    graph.nodes.push(structuredClone(graph.nodes[0]));assert.throws(()=>validateGraphStructure(graph),/重复/);
    const dangling=structuredClone(prompt);dangling['2'].inputs.latent=['missing',0];assert.throws(()=>importComfy(dangling,catalog),/不存在/);
    const invalid=importComfy(prompt,catalog);invalid.edges.push({id:'orphan',source:'1',target:'missing',sourceHandle:'0',targetHandle:'latent'});assert.throws(()=>compilePrompt(invalid,catalog),/不存在/);
});
test('Connection validation agrees with compilation and supports union types', () => {
    const graph=importComfy(prompt,catalog);const edge=graph.edges[0];graph.edges=[];
    assert.equal(validConnection(edge,graph,catalog),true);
    assert.equal(validConnection({...edge,sourceHandle:'-1'},graph,catalog),false);
    graph.edges.push(edge);assert.equal(validConnection(edge,graph,catalog),false);
    const union=structuredClone(catalog);union.Output.input.required.latent=['IMAGE,LATENT',{}];assert.doesNotThrow(()=>compilePrompt(graph,union));
});

test('Offline API JSON preserves custom inputs, titles and links without Worker metadata',()=>{
 const raw={prompt:{'a':{class_type:'UnknownSource',inputs:{text:'花鸟',settings:{strength:.7},list:[1,2,3]},_meta:{title:'原始标题',custom:'keep'}},'b':{class_type:'UnknownSink',inputs:{image:['a',0]}}}};
 const graph=importComfy(raw);
 const exported=exportComfyApi(graph);
 assert.deepEqual(exported.a,raw.prompt.a);assert.deepEqual(exported.b.inputs,raw.prompt.b.inputs);
 graph.nodes[0].data.widgets.text='修改文字';assert.equal(exportComfyApi(graph).a.inputs.text,'修改文字');
 const backup={format:'artedu-comfy-workflow',definition:graph};assert.deepEqual(exportComfyApi(importComfy(backup)),exportComfyApi(graph));
});

test('Standard UI 0.4 and 1.0 exports have valid bidirectional sockets and preserve parameters',()=>{
 const graph=importComfy(prompt,catalog);graph.viewport={x:-30,y:45,zoom:.8};
 for(const version of [.4,1]){
  const ui=exportComfyUI(graph,catalog,version);assert.equal(ui.version,version);assert.ok(Array.isArray(ui.nodes));
  assert.equal(ui.nodes.find(n=>String(n.id)==='2').inputs[0].link,1);
  assert.deepEqual(ui.nodes.find(n=>String(n.id)==='1').outputs[0].links,[1]);
  assert.equal(Array.isArray(ui.links[0]),version===.4);
  const again=importComfy(ui,catalog);assert.deepEqual(exportComfyApi(again,catalog)['1'].inputs,prompt['1'].inputs);assert.deepEqual(exportComfyApi(again,catalog)['2'].inputs,prompt['2'].inputs);assert.deepEqual(again.viewport,graph.viewport);
 }
});

test('Offline UI preserves opaque widgets, custom properties, modes and subgraphs rather than inventing API semantics',()=>{
 const raw={version:1,state:{lastNodeId:7,lastLinkId:0},extra:{custom:{keep:true},ds:{scale:.5,offset:[12,34]}},definitions:{subgraphs:[{id:'nested',nodes:[{type:'Custom'}]}]},nodes:[{id:7,type:'nested',title:'自定义子图',pos:[-12,18],size:[200,100],mode:4,flags:{collapsed:true},properties:{plugin:'keep'},inputs:[],outputs:[],widgets_values:[1,'opaque']}],links:[],groups:[{title:'单节点组',bounding:[-100,0,500,500],font_size:20}]};
 const graph=importComfy(raw);graph.nodes[0].position.x=22;
 const ui=exportComfyUI(graph,{},1);assert.deepEqual(ui.definitions,raw.definitions);assert.deepEqual(ui.nodes[0].widgets_values,[1,'opaque']);assert.equal(ui.nodes[0].mode,4);assert.equal(ui.nodes[0].pos[0],22);assert.deepEqual(ui.groups,raw.groups);assert.equal(ui.extra.custom.keep,true);
 assert.throws(()=>exportComfyApi(graph),/子图/);
});

test('Reroute topology, seed strategy, titles and groups round-trip through standard UI export',()=>{
 const c={...catalog,Source:{...catalog.Source,input:{required:{seed:['INT',{control_after_generate:true}],text:['STRING',{}]}}}};
 const raw={version:.4,nodes:[{id:1,type:'Source',title:'随机源',pos:[0,0],widgets_values:[42,'randomize','flower']},{id:2,type:'Reroute',pos:[300,0],inputs:[{name:'input',type:'*'}],outputs:[{name:'output',type:'*'}]},{id:3,type:'Output',pos:[600,0],widgets_values:[],inputs:[{name:'latent',type:'LATENT'}]}],links:[[1,1,0,2,0,'LATENT'],[2,2,0,3,0,'LATENT']],groups:[{title:'链路',color:'#123456',bounding:[-10,-10,1000,400]}]};
 const graph=importComfy(raw,c);const ui=exportComfyUI(graph,c);
 assert.equal(ui.nodes.length,3);assert.deepEqual(ui.links,raw.links);assert.deepEqual(ui.nodes[0].widgets_values,[42,'randomize','flower']);assert.equal(ui.nodes[0].title,'随机源');
 assert.deepEqual(exportComfyApi(importComfy(ui,c),c)['3'].inputs,{latent:['1',0]});
});

test('Named widget values can be imported offline; unknown positional arrays cannot masquerade as API inputs',()=>{
 const named={version:1,nodes:[{id:1,type:'Plugin',widgets_values:{value:'hello'},inputs:[],outputs:[]}],links:[]};
 assert.deepEqual(exportComfyApi(importComfy(named))['1'].inputs,{value:'hello'});
 named.nodes[0].widgets_values=['hello'];assert.throws(()=>exportComfyApi(importComfy(named)),/控件定义/);
 const invalid={nodes:[{id:1,type:'Plugin',pos:[0,0]},{id:'1',type:'Plugin',pos:[1,0]}],links:[]};assert.throws(()=>importComfy(invalid),/重复/);
});

function pngWithText(type,payload){
 const chunk=(name,data)=>{const size=Buffer.alloc(4);size.writeUInt32BE(data.length);return Buffer.concat([size,Buffer.from(name),data,Buffer.alloc(4)]);};
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk(type,payload),chunk('IEND',Buffer.alloc(0))]);
}
test('PNG tEXt and compressed zTXt metadata import prefers UI layout and rejects missing/truncated metadata',async()=>{
 for(const type of ['tEXt','zTXt']){
  const json=JSON.stringify(prompt);const payload=Buffer.concat([Buffer.from('prompt\0'),...(type==='zTXt'?[Buffer.from([0]),deflateSync(json)]:[Buffer.from(json)])]);
  const file=new File([pngWithText(type,payload)],'workflow.png');assert.deepEqual(exportComfyApi(importComfy(await readComfyWorkflowFile(file)))['1'].inputs,prompt['1'].inputs);
 }
 await assert.rejects(readComfyWorkflowFile(new File([pngWithText('tEXt',Buffer.from('author\0demo'))],'missing.png')),/未包含/);
 await assert.rejects(readComfyWorkflowFile(new File([Buffer.from([137,80,78,71])],'bad.png')),/有效/);
});

test('PNG containing both UI and API metadata preserves layout and provides named API inputs offline',async()=>{
 const ui={version:1,nodes:[{id:1,type:'Source',pos:[100,200],widgets_values:[7,'flower'],inputs:[],outputs:[{name:'LATENT',type:'LATENT'}]},{id:2,type:'Output',pos:[500,200],widgets_values:[],inputs:[{name:'latent',type:'LATENT'}],outputs:[]}],links:[{id:1,origin_id:1,origin_slot:0,target_id:2,target_slot:0,type:'LATENT'}]};
 const a=pngWithText('tEXt',Buffer.from('workflow\0'+JSON.stringify(ui))),b=pngWithText('tEXt',Buffer.from('prompt\0'+JSON.stringify(prompt)));
 const png=Buffer.concat([a.subarray(0,a.length-12),b.subarray(8)]);
 const graph=importComfy(await readComfyWorkflowFile(new File([png],'both.png')));
 assert.deepEqual(graph.nodes[0].position,{x:100,y:200});assert.deepEqual(exportComfyApi(graph)['1'].inputs,prompt['1'].inputs);
 assert.deepEqual(exportComfyUI(graph).nodes[0].widgets_values,[7,'flower']);
 graph.nodes[0].data.widgets.text='new';assert.throws(()=>exportComfyUI(graph),/控件顺序/);assert.equal(exportComfyApi(graph)['1'].inputs.text,'new');
});

test('PNG international text and decompression limits are enforced',async()=>{
 const text=Buffer.from(JSON.stringify(prompt));
 for(const compressed of [false,true]){
  const payload=Buffer.concat([Buffer.from('prompt\0'),Buffer.from([Number(compressed),0,0,0]),compressed?deflateSync(text):text]);
  const raw=await readComfyWorkflowFile(new File([pngWithText('iTXt',payload)],'international.png'));
  assert.deepEqual(exportComfyApi(importComfy(raw))['1'].inputs,prompt['1'].inputs);
 }
 const huge=Buffer.concat([Buffer.from('prompt\0'),Buffer.from([0]),deflateSync(Buffer.from('x'.repeat(750001)))]);
 await assert.rejects(readComfyWorkflowFile(new File([pngWithText('zTXt',huge)],'large.png')),/过大/);
 assert.throws(()=>importComfy({'1':{class_type:'x',inputs:{}},'2':{class_type:'y',inputs:{input:['1',999999999]}}}),/端口/);
});

test('Copied imported nodes export unique IDs, and modern reroute link metadata is retained',()=>{
 const raw={version:1,nodes:[{id:1,type:'Plugin',pos:[0,0],widgets_values:{text:'original'},inputs:[],outputs:[]}],links:[]};
 const graph=importComfy(raw);const copied=structuredClone(graph.nodes[0]);copied.id='copy-1';graph.nodes.push(copied);
 const ui=exportComfyUI(graph);assert.deepEqual(ui.nodes.map(n=>n.id),[1,'copy-1']);assert.doesNotThrow(()=>importComfy(ui));
 const modern={version:1,nodes:[{id:1,type:'A',widgets_values:{},inputs:[],outputs:[{name:'image',type:'IMAGE'}]},{id:2,type:'B',widgets_values:{},inputs:[{name:'image',type:'IMAGE'}],outputs:[]}],links:[{id:1,origin_id:1,origin_slot:0,target_id:2,target_slot:0,type:'IMAGE',parent_id:7}],reroutes:[{id:7,pos:[20,30]}]};
 const routed=importComfy(modern);assert.equal(exportComfyUI(routed,{},1).links[0].parent_id,7);
 assert.throws(()=>exportComfyUI(routed,{},.4),/转接点/);
});
