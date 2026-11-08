import {createHash,randomUUID} from 'node:crypto';import {z} from 'zod';
import type {ModelToolDefinition} from '../generation/model-adapter';import type {KnowledgeService} from '../knowledge/knowledge.service';import type {Actor} from '../auth/auth.service';
import {buildLearningRoute} from './learning-route';
const id=z.string().trim().min(1).max(160),edge=z.object({fromNodeId:id,toNodeId:id}).strict();
export const routeSchema=z.object({theme:z.string().trim().min(1).max(500),startId:id,targetId:id,requiredNodeIds:z.array(id).max(12).default([]),scope:z.enum(['network','published']).default('network'),blockedEdges:z.array(edge).max(30).default([])}).strict();
const reviewSchema=z.object({planId:id,reviews:z.array(z.object({connectionId:id,decision:z.enum(['keep','unrelated','uncertain']),reason:z.string().trim().min(10).max(1200),evidenceNodeIds:z.array(id).min(1).max(6)}).strict()).max(100)}).strict();
export const learningRouteTools:ModelToolDefinition[]=[
 {type:'function',function:{name:'plan_learning_route',description:'先读知识图谱，按用户主题选择真实起点、目标及必学节点后调用。只读生成 BFS 主线、必学点最近接入的学习子图，并用标签/描述和最多6节点局部窗口筛查关联；reviewQueue 是必须由你复核的片段，不能把词汇低分当作不相关。不会写图谱或报名。',parameters:{type:'object',additionalProperties:false,properties:{theme:{type:'string'},startId:{type:'string'},targetId:{type:'string'},requiredNodeIds:{type:'array',items:{type:'string'},maxItems:12},scope:{type:'string',enum:['network','published']},blockedEdges:{type:'array',maxItems:30,items:{type:'object',properties:{fromNodeId:{type:'string'},toNodeId:{type:'string'}},required:['fromNodeId','toNodeId'],additionalProperties:false}}},required:['theme','startId','targetId']}}},
 {type:'function',function:{name:'review_learning_route',description:'复核 plan_learning_route 的全部 reviewQueue 后提交结果。根据用户主题、教师描述/标签和局部窗口判断 keep（直接相关、基础支撑或合理桥接）、unrelated 或 uncertain；逐项给理由和窗口内依据节点ID。相关不等于先修。不可编造教师结论。未通过时可使用返回的排除边重新规划，保留必学点；仍无法解决时如实说明。只保存在本次运行的短期内存中。',parameters:{type:'object',additionalProperties:false,properties:{planId:{type:'string'},reviews:{type:'array',maxItems:100,items:{type:'object',additionalProperties:false,properties:{connectionId:{type:'string'},decision:{type:'string',enum:['keep','unrelated','uncertain']},reason:{type:'string'},evidenceNodeIds:{type:'array',items:{type:'string'},minItems:1,maxItems:6}},required:['connectionId','decision','reason','evidenceNodeIds']}}},required:['planId','reviews']}}}
];
type Candidate=ReturnType<typeof buildLearningRoute>;
const cache=new Map<string,{owner:string;run:string;expires:number;fingerprint:string;scope:string;theme:string;candidate:Candidate}>();
const fingerprint=(map:any)=>createHash('sha256').update(JSON.stringify([map.nodes.map((n:any)=>[n.id,n.title,n.description,n.tags,n.showInNetwork]),map.edges,map.bindings])).digest('hex');
export async function executeLearningRouteTool(name:string,input:unknown,service:KnowledgeService,actor:Actor,runId:string,workflowsEnabled:boolean){
 const now=Date.now();for(const [key,value]of cache)if(value.expires<=now)cache.delete(key);
 if(name==='plan_learning_route'){
  const args=routeSchema.parse(input),map=await service.getMap(actor),nodes=map.nodes.filter(node=>args.scope==='published'||node.showInNetwork);
  if(nodes.length>1000)throw Error('图谱超过初版1000节点计算范围，请缩小开放范围');
  const candidate=buildLearningRoute(nodes,map.edges,args);if(candidate.status==='unreachable')return candidate;
  if(candidate.nodes.length>60||candidate.reviewQueue.length>100)throw Error('候选子图过大，请减少本轮必学点或缩小范围');
  while(cache.size>=128)cache.delete(cache.keys().next().value!);
  const planId='learning-plan-'+randomUUID();cache.set(planId,{owner:actor.id,run:runId,expires:now+20*60000,fingerprint:fingerprint(map),scope:args.scope,theme:args.theme,candidate});
  return {...candidate,status:candidate.status==='incomplete'?'incomplete':candidate.reviewQueue.length?'needs_review':'screened_candidate',planId,theme:args.theme,bindings:map.bindings.filter(binding=>candidate.nodes.some(node=>node.id===binding.nodeId)&&(workflowsEnabled||binding.targetType!=='workflow')),nextStep:candidate.status==='incomplete'?'先说明不可达点或先修冲突，不得声称方案完成':candidate.reviewQueue.length?'根据主题和教师描述逐项复核 reviewQueue，调用 review_learning_route；不要直接输出未经复核的方案':'局部初筛通过；说明候选方案的主题适配性，统计关联不代表教学有效性'};
 }
 const args=reviewSchema.parse(input),entry=cache.get(args.planId);if(!entry||entry.owner!==actor.id||entry.run!==runId)throw Error('方案已过期或不属于当前用户与运行');
 if(entry.fingerprint!==fingerprint(await service.getMap(actor)))throw Error('图谱或关联资源已变化，请重新规划');
 const candidate=entry.candidate;if(candidate.status==='unreachable')throw Error('该方案不可复核');
 const expected=new Map(candidate.reviewQueue.map(item=>[item.id,item]));
 if(args.reviews.length!==expected.size||new Set(args.reviews.map(item=>item.connectionId)).size!==expected.size)throw Error('必须完整且不重复地复核所有可疑连接');
 for(const review of args.reviews){const item=expected.get(review.connectionId);if(!item||review.evidenceNodeIds.some(id=>!item.windowNodeIds.includes(id)))throw Error('复核引用了不存在的连接或窗口外的节点');}
 const rejected=args.reviews.filter(review=>review.decision!=='keep');
 return {status:candidate.status==='incomplete'?'incomplete':rejected.length?'needs_revision':'reviewed_candidate',planId:args.planId,theme:entry.theme,reviews:args.reviews,blockedEdges:args.reviews.filter(review=>review.decision==='unrelated').flatMap(review=>{const item=expected.get(review.connectionId)!;return item.relation==='related'?[{fromNodeId:item.fromNodeId,toNodeId:item.toNodeId},{fromNodeId:item.toNodeId,toNodeId:item.fromNodeId}]:[{fromNodeId:item.fromNodeId,toNodeId:item.toNodeId}];}),note:'这是 LLM 对候选连接的解释性复核，不是教师确认。未修改图谱、能力记录或学习路径。'};
}
