import 'reflect-metadata';
import {test} from 'node:test';import assert from 'node:assert/strict';
import {KnowledgeService} from './knowledge.service';
import {nodeInputSchema,nodeUpdateSchema} from './knowledge.contracts';
test('network endpoint returns only selected published map nodes and their bindings; duplicate undirected edges collapse',async()=>{
 const service=new KnowledgeService({} as any,{} as any);
 service.getMap=async()=>({nodes:[{id:'a',showInNetwork:true,tags:['观察']},{id:'b',showInNetwork:true,tags:[]},{id:'c',showInNetwork:false,tags:[]}],edges:[{fromNodeId:'a',toNodeId:'b',relation:'related'},{fromNodeId:'b',toNodeId:'a',relation:'related'},{fromNodeId:'a',toNodeId:'c',relation:'related'}],bindings:[{nodeId:'a'},{nodeId:'c'}]}) as any;
 const result=await service.getNetwork({id:'student'} as any);assert.equal(result.nodes.length,2);assert.equal(result.edges.length,1);assert.equal(result.bindings.length,1);assert.equal(result.summary.tagged,1);
});
test('tag editing validates limits and boolean visibility while preserving compatibility with existing nodes',()=>{
 assert.equal(nodeInputSchema.safeParse({title:'观察'}).success,true);assert.equal(nodeUpdateSchema.safeParse({tags:[],showInNetwork:false}).success,true);
 for(const input of [{tags:['重复','重复']},{tags:['']},{tags:Array.from({length:13},(_,i)=>String(i))},{tags:['a'.repeat(41)]},{showInNetwork:'false'},{source:'manual'}])assert.equal(nodeUpdateSchema.safeParse(input).success,false);
});
