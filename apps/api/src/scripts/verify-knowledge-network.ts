import 'reflect-metadata';import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';import path from 'node:path';
import {withDatabase} from './run-sql-file';import {KnowledgeService} from '../modules/knowledge/knowledge.service';import {AuthService} from '../modules/auth/auth.service';
void withDatabase(async pool=>{const client=await pool.connect();await client.query('BEGIN');try{
 let chain:Promise<unknown>=Promise.resolve();const db={query:(sql:string,args:unknown[]=[])=>{const result=chain.then(()=>client.query(sql,args));chain=result.catch(()=>undefined);return result;}} as any;
 const service=new KnowledgeService(db,new AuthService(db));const actor={id:'network-validation',roles:['admin']} as any;
 const graph=await service.getNetwork(actor);assert.equal(graph.nodes.length,30);assert.equal(graph.summary.tagged,12);assert.ok(graph.edges.length>=51);assert.ok(graph.edges.every(edge=>edge.relation==='related'));
 const node=graph.nodes[0];const before=node.tags;
 await service.updateNode(actor,node.id,{tags:['校验标签'],showInNetwork:false});assert.equal((await service.getNetwork(actor)).nodes.length,29);
 await service.updateNode(actor,node.id,{tags:before,showInNetwork:true});
 await client.query('SELECT refresh_knowledge_labels()');const synced=await service.getNetwork(actor);assert.equal(synced.nodes.length,30);assert.equal(synced.summary.tagged,12);assert.equal(synced.edges.length,graph.edges.length);
 assert.ok(synced.nodes.every(node=>synced.bindings.some(binding=>binding.nodeId===node.id)));
 const output=path.resolve('data/qa/knowledge-network');await mkdir(output,{recursive:true});await writeFile(path.join(output,'network-fixture.json'),JSON.stringify(graph));
 console.log(JSON.stringify({verified:true,...graph.summary,bindings:graph.bindings.length,checks:'tags persisted, visibility toggle, label sync preserves graph; test writes rolled back'}));
 }finally{await client.query('ROLLBACK');client.release();}});
