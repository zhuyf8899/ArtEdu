import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {importComfy,exportComfyUI} from '../src/comfyGraph.js';
const root=new URL('../../data/comfy-workflow-library/',import.meta.url);
const manifest=JSON.parse(await readFile(new URL('manifest.json',root),'utf8'));
test('reference library includes at least eight distinct official workflows and a pinned license',async()=>{
 assert.ok(manifest.cases.length>=8);assert.equal(new Set(manifest.cases.map(c=>c.sourcePath)).size,manifest.cases.length);assert.match(manifest.commit,/^[a-f0-9]{40}$/);assert.match(await readFile(new URL('LICENSE',root),'utf8'),/MIT License/);
});
for(const record of manifest.cases)test(`${record.title}: original bytes and all saved fields survive platform backup`,async()=>{
 const original=await readFile(new URL('originals/'+record.sourcePath.split('/').pop(),root));
 const replica=await readFile(new URL('replicas/'+record.id+'.json',root));
 assert.deepEqual(replica,original);assert.equal(createHash('sha256').update(original).digest('hex'),record.sourceSha256);
 const raw=JSON.parse(original),graph=importComfy(raw);
 assert.equal(graph.nodes.length,record.nodes);assert.equal(graph.edges.length,record.links);assert.deepEqual(exportComfyUI(graph,{},raw.version),raw);
 const backup=JSON.parse(await readFile(new URL('platform/'+record.id+'.json',root),'utf8'));
 assert.deepEqual(exportComfyUI(importComfy(backup),{},raw.version),raw);
});
test('opaque widget editing changes the actual original slot and keeps bypass mode',async()=>{
 const raw=JSON.parse(await readFile(new URL('originals/lora.json',root),'utf8'));
 const graph=importComfy(raw),node=graph.nodes.find(n=>n.data.classType==='LoraLoader'&&n.data.comfyUI.mode===4);
 node.data.comfyUI.widgets_values[1]=.25;
 const exported=exportComfyUI(graph);assert.equal(exported.nodes.find(n=>String(n.id)===node.id).widgets_values[1],.25);assert.equal(exported.nodes.find(n=>String(n.id)===node.id).mode,4);
});
