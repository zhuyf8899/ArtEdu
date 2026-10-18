import test from 'node:test';
import assert from 'node:assert/strict';
import { compilePrompt, importComfy, nodeFromInfo, ports, validateGraphStructure, validConnection } from '../src/comfyGraph.js';
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
