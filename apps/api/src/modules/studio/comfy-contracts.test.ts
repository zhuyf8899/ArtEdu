import test from 'node:test';
import assert from 'node:assert/strict';
import { registrySchema, validatePrompt, compileGraph } from './comfy-contracts';
import { workflowDefinitionSchema } from './studio.contracts';
const c = { Source: { input: { required: { seed: ['INT', { min: 0, max: 100 }], text: ['STRING', {}] } }, output: ['LATENT'] }, Output: { input: { required: { latent: ['LATENT', {}] } }, output: [], output_node: true } };
const p = () => ({ '1': { class_type: 'Source', inputs: { seed: 7, text: 'flower' } }, '2': { class_type: 'Output', inputs: { latent: ['1', 0] } } });
test('Validate native DAG against trusted Worker metadata', () => { assert.doesNotThrow(() => registrySchema.parse({ nodes: c })); assert.doesNotThrow(() => validatePrompt(p(), c)); });
test('Reject unavailable nodes, missing required input and out of range parameters', () => { const x: any = p(); x['1'].class_type = 'UnapprovedPython'; assert.throws(() => validatePrompt(x, c), /未授权/); const y: any = p(); delete y['1'].inputs.text; assert.throws(() => validatePrompt(y, c), /缺少/); const z: any = p(); z['1'].inputs.seed = 101; assert.throws(() => validatePrompt(z, c), /越界/); });
test('Typed ports reject an IMAGE wired to LATENT and require output node', () => { const wrong = structuredClone(c); wrong.Source.output = ['IMAGE']; assert.throws(() => validatePrompt(p(), wrong), /类型不匹配/); assert.throws(() => validatePrompt({ '1': p()['1'] }, c), /输出节点/); });
test('Self-reference and duplicate graph cycles are rejected', () => { const x: any = p(); x['2'].inputs.latent = ['2', 0]; const cycleCatalog = { ...c, Output: { ...c.Output, output: ['LATENT'] } }; assert.throws(() => validatePrompt(x, cycleCatalog), /循环/); });
test('Real ComfyUI one-element port definitions and enum lists register correctly', () => { assert.doesNotThrow(() => registrySchema.parse({ nodes: { PreviewImage: { input: { required: { images: ['IMAGE'] } }, output: [], output_node: true }, ControlNetLoader: { input: { required: { control_net_name: [['model.safetensors']] } }, output: ['CONTROL_NET'] } } })); });

test('Union ports match frontend; forceInput cannot be satisfied by literal widgets', () => {
 const union=structuredClone(c);union.Output.input.required.latent=['IMAGE,LATENT',{}];assert.doesNotThrow(()=>validatePrompt(p(),union));
 const forced:any=structuredClone(c);forced.Source.input.required.seed=['INT',{min:0,max:100,forceInput:true}];assert.throws(()=>validatePrompt(p(),forced),/必须连接/);
});
test('Draft graph schema permits incomplete inputs while rejecting cycles and duplicate connections', () => {
 const node=(id:string)=>({id,type:'comfy',position:{x:0,y:0},data:{label:id,classType:'Output',widgets:{}}});
 const graph:any={engine:'comfyui',nodes:[node('a'),node('b')],edges:[]};
 assert.equal(workflowDefinitionSchema.safeParse(graph).success,true);
 graph.edges=[{id:'one',source:'a',target:'b',sourceHandle:'0',targetHandle:'latent'},{id:'two',source:'b',target:'a',sourceHandle:'0',targetHandle:'latent'}];assert.equal(workflowDefinitionSchema.safeParse(graph).success,false);
 graph.edges=[graph.edges[0],{...graph.edges[0],id:'duplicate'}];assert.equal(workflowDefinitionSchema.safeParse(graph).success,false);
 graph.edges=[];delete graph.nodes[0].data.classType;assert.equal(workflowDefinitionSchema.safeParse(graph).success,false);
});
test('Compilation rejects duplicate node IDs instead of overwriting the first node', () => {
 const node={id:'a',data:{classType:'Source',label:'source',widgets:{seed:7,text:'flower'}}};
 assert.throws(()=>compileGraph({nodes:[node,node],edges:[]},c),/重复/);
});
