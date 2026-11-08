import 'reflect-metadata';import {test} from 'node:test';import assert from 'node:assert/strict';
import {buildLearningRoute} from './learning-route';import {executeLearningRouteTool} from './learning-route-tools';import {allowsTaskTool,isMutation,assessDelivery} from './agent-policy';
const nodes=['s','a','t','m','x'].map(id=>({id,title:id,description:'',tags:[]}));
const edge=(a:string,b:string,relation='prerequisite')=>({fromNodeId:a,toNodeId:b,relation});
const edges=[edge('s','a','related'),edge('a','t','related'),edge('m','x','related'),edge('x','a','related')];
const args={theme:'用户研究',startId:'s',targetId:'t',requiredNodeIds:['m']};
test('BFS backbone and nearest required-node attachment form a connected subgraph using only existing edges',()=>{
 const result=buildLearningRoute(nodes,edges,args);assert.equal(result.status,'candidate');
 assert.deepEqual(result.backbone,['s','a','t']);assert.deepEqual(result.attachments,[['m','x','a']]);assert.equal(result.nodes.length,5);assert.ok(result.reviewQueue.length>0);assert.ok(result.checks.every(check=>check.windowNodeIds.length<=6));
 for(const selected of result.edges)assert.ok(edges.some(edge=>edge.fromNodeId===selected.fromNodeId&&edge.toNodeId===selected.toNodeId||edge.relation==='related'&&edge.fromNodeId===selected.toNodeId&&edge.toNodeId===selected.fromNodeId));
});
test('directed edges cannot be reversed and all prerequisite branches must be retained',()=>{
 const graph=[edge('s','a'),edge('a','t'),edge('m','t')];const result=buildLearningRoute(nodes,graph,{...args,requiredNodeIds:[]});assert.equal(result.status,'candidate');assert.ok(result.nodes.some(node=>node.id==='m'));assert.ok(result.edges.some(edge=>edge.fromNodeId==='m'&&edge.toNodeId==='t'));
 assert.equal(buildLearningRoute(nodes,graph,{...args,startId:'t',targetId:'s'}).status,'unreachable');
 const cycle=buildLearningRoute(nodes,[...graph,edge('t','a')],args);assert.equal(cycle.status,'incomplete');
});
test('unreachable required points, blocked dependencies and invalid IDs are reported, not dropped',()=>{
 const result=buildLearningRoute(nodes,[edge('s','t')],args);assert.equal(result.status,'incomplete');assert.deepEqual(result.unreachableNodeIds,['m']);
 assert.equal(buildLearningRoute(nodes,[edge('s','t'),edge('m','t')],{...args,blockedEdges:[{fromNodeId:'m',toNodeId:'t'}]}).status,'incomplete');
 assert.throws(()=>buildLearningRoute(nodes,edges,{...args,startId:'private'}),/不存在/);
});
test('LLM reviews must cover every flagged connection, remain user/run scoped, and cannot cite outside their windows',async()=>{
 const actor={id:'owner'} as any,service={getMap:async()=>({nodes:nodes.map(node=>({...node,showInNetwork:true})),edges,bindings:[]})} as any;
 const plan:any=await executeLearningRouteTool('plan_learning_route',args,service,actor,'run',false);assert.equal(plan.status,'needs_review');
 await assert.rejects(()=>executeLearningRouteTool('review_learning_route',{planId:plan.planId,reviews:[]},service,actor,'run',false),/完整/);
 const reviews=plan.reviewQueue.map((item:any)=>({connectionId:item.id,decision:'keep',reason:'该节点为后续主题提供基础，依据窗口内教师描述进行判断',evidenceNodeIds:[item.fromNodeId]}));
 await assert.rejects(()=>executeLearningRouteTool('review_learning_route',{planId:plan.planId,reviews},service,{id:'other'} as any,'run',false),/不属于/);
 const result:any=await executeLearningRouteTool('review_learning_route',{planId:plan.planId,reviews},service,actor,'run',false);assert.equal(result.status,'reviewed_candidate');
 reviews[0].decision='unrelated';const rejected:any=await executeLearningRouteTool('review_learning_route',{planId:plan.planId,reviews},service,actor,'run',false);assert.equal(rejected.status,'needs_revision');assert.equal(rejected.blockedEdges.length,2);
 reviews[0].evidenceNodeIds=['fabricated'];await assert.rejects(()=>executeLearningRouteTool('review_learning_route',{planId:plan.planId,reviews},service,actor,'run',false),/窗口外/);
 for(const name of ['plan_learning_route','review_learning_route']){assert.equal(isMutation(name),false);assert.equal(allowsTaskTool({action:'answer',deliverables:[]},name),true);}
});

test('delivery cannot claim completion before local review, or when dependencies remain unresolved',()=>{
 const contract={action:'answer',deliverables:[]} as any;
 const plan={name:'plan_learning_route',output:{planId:'p',status:'needs_review'}};
 assert.equal(assessDelivery({contract,content:'方案完成',ledger:[plan]}).status,'partial');
 assert.equal(assessDelivery({contract,content:'方案完成',ledger:[plan,{name:'review_learning_route',output:{planId:'p',status:'reviewed_candidate'}}]}).status,'succeeded');
 assert.equal(assessDelivery({contract,content:'方案完成',ledger:[{name:'plan_learning_route',output:{planId:'p',status:'incomplete'}},{name:'review_learning_route',output:{planId:'p',status:'incomplete'}}]}).status,'partial');
});

test('strong tag and description evidence can pass screening, while absent tags are not automatic rejection',()=>{
 const graphNodes=[{id:'a',title:'需求观察',description:'观察使用行为并整理用户需求，理解用户任务与使用情境。',tags:['用户研究']},{id:'b',title:'需求整理',description:'观察使用行为并整理用户需求，分析用户任务与使用情境。',tags:['用户研究']},{id:'c',title:'陶瓷烧制',description:'准备黏土并控制窑炉温度，完成器物烧制与修整。',tags:[]}];
 const result=buildLearningRoute(graphNodes,[edge('a','b','related')],{theme:'用户研究',startId:'a',targetId:'b',requiredNodeIds:[]});assert.equal(result.status,'candidate');assert.equal(result.reviewQueue?.length,0);
});
