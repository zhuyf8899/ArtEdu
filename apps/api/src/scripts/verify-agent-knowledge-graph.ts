import type {readKnowledgeGraph} from "../modules/agent/knowledge-graph-tool";
import 'dotenv/config';import 'reflect-metadata';import assert from 'node:assert/strict';import {Pool} from 'pg';
import {KnowledgeService} from '../modules/knowledge/knowledge.service';import {AuthService} from '../modules/auth/auth.service';import {executePlatformTool} from '../modules/agent/agent-tools';
async function main(){const pool=new Pool({connectionString:process.env.DATABASE_URL});const client=await pool.connect();try{
 await client.query('BEGIN READ ONLY');let chain:Promise<unknown>=Promise.resolve();const db={query:(sql:string,args:unknown[]=[])=>{const result=chain.then(()=>client.query(sql,args));chain=result.catch(()=>undefined);return result;}} as any;
 const knowledge=new KnowledgeService(db,new AuthService(db));const actor={id:'graph-read-validation',roles:['student']} as any;
 const call=async(args:any)=>await executePlatformTool({function:{name:'get_knowledge_graph',arguments:JSON.stringify(args)}} as any,{} as any,{actor,knowledge,database:db} as any) as Awaited<ReturnType<typeof readKnowledgeGraph>>;
 const graph=await call({});assert.equal(graph.nodes.length,30);assert.ok(graph.edges.length>=51);assert.equal(graph.truncated,false);assert.equal(graph.nodes.filter((node:any)=>node.tags.length).length,12);
 const detail=await call({nodeId:graph.nodes[0].id,depth:1});assert.ok(detail.nodes.some((node:any)=>node.id===graph.nodes[0].id));assert.ok(detail.edges.length>0);
 const missing=await call({query:'此查询不对应任何现有知识节点'});assert.equal(missing.nodes.length,0);
 console.log(JSON.stringify({verified:true,nodes:graph.nodes.length,edges:graph.edges.length,bindings:graph.bindings.length,neighborNodes:detail.nodes.length,readOnly:true}));
 }finally{await client.query('ROLLBACK');client.release();await pool.end();}}
void main().catch(error=>{console.error(error.message);process.exitCode=1;});
