export interface RouteNode {id:string;title:string;description:string;tags:string[];}
export interface RouteEdge {fromNodeId:string;toNodeId:string;relation:string;}
export interface RouteInput {theme:string;startId:string;targetId:string;requiredNodeIds:string[];blockedEdges?:{fromNodeId:string;toNodeId:string}[];}
const key=(a:string,b:string)=>a+'>'+b;
function tokens(text:string){const result=new Set<string>();for(const word of text.toLowerCase().match(/[\p{L}\p{N}]+/gu)??[]){if(word.length<=30)result.add(word);if(/[\p{Script=Han}]/u.test(word))for(const size of [2,3])for(let i=0;i+size<=word.length;i++)result.add(word.slice(i,i+size));}return result;}
function similarity(nodes:RouteNode[]){const docs=nodes.map(node=>tokens(node.title+' '+node.description));const df=new Map<string,number>();for(const doc of docs)for(const term of doc)df.set(term,(df.get(term)??0)+1);const weights=new Map([...df].map(([term,n])=>[term,Math.log((nodes.length+1)/(n+1))]));const vectors=docs.map(doc=>new Map([...doc].map(term=>[term,weights.get(term)??0])));return (a:string,b:string)=>{const x=vectors[nodes.findIndex(node=>node.id===a)],y=vectors[nodes.findIndex(node=>node.id===b)];let dot=0,nx=0,ny=0;for(const [term,v]of x){nx+=v*v;dot+=v*(y.get(term)??0);}for(const v of y.values())ny+=v*v;return nx&&ny?dot/Math.sqrt(nx*ny):0;};}
export function buildLearningRoute(nodes:RouteNode[],edges:RouteEdge[],input:RouteInput){
 const ids=new Set(nodes.map(node=>node.id));for(const id of [input.startId,input.targetId,...input.requiredNodeIds])if(!ids.has(id))throw Error('节点不存在或不在当前开放范围：'+id);
 const banned=new Set((input.blockedEdges??[]).map(edge=>key(edge.fromNodeId,edge.toNodeId))),arcs=new Map<string,RouteEdge>();
 for(const edge of edges){if(!ids.has(edge.fromNodeId)||!ids.has(edge.toNodeId))continue;for(const [a,b]of edge.relation==='related'?[[edge.fromNodeId,edge.toNodeId],[edge.toNodeId,edge.fromNodeId]]:[[edge.fromNodeId,edge.toNodeId]])if(!banned.has(key(a,b)))arcs.set(key(a,b),{...edge,fromNodeId:a,toNodeId:b});}
 const out=new Map(nodes.map(node=>[node.id,[] as string[]])),incoming=new Map(nodes.map(node=>[node.id,[] as string[]]));for(const edge of arcs.values()){out.get(edge.fromNodeId)!.push(edge.toNodeId);incoming.get(edge.toNodeId)!.push(edge.fromNodeId);}
 const parents=new Map<string,string|null>([[input.startId,null]]),queue=[input.startId];for(let i=0;i<queue.length&&!parents.has(input.targetId);i++)for(const next of out.get(queue[i])!)if(!parents.has(next)){parents.set(next,queue[i]);queue.push(next);}
 if(!parents.has(input.targetId))return {status:'unreachable' as const,reason:'起点无法沿现有连接到达目标',unreachableNodeIds:[input.targetId]};
 const backbone:string[]=[];for(let id:string|null=input.targetId;id!==null;id=parents.get(id)!)backbone.unshift(id);
 const chosen=new Set(backbone),selectedEdges=new Map<string,RouteEdge>(),attachments:string[][]=[];for(let i=1;i<backbone.length;i++)selectedEdges.set(key(backbone[i-1],backbone[i]),arcs.get(key(backbone[i-1],backbone[i]))!);
 const required=new Set(input.requiredNodeIds),unreachable=new Set<string>();
 for(let iteration=0;iteration<=nodes.length;iteration++){
  // Explicit prerequisites are AND requirements. Related edges do not establish prerequisites.
  let changed=true;while(changed){changed=false;for(const edge of edges)if(edge.relation==='prerequisite'&&(chosen.has(edge.toNodeId)||required.has(edge.toNodeId))&&ids.has(edge.fromNodeId)&&!required.has(edge.fromNodeId)&&!chosen.has(edge.fromNodeId)){required.add(edge.fromNodeId);changed=true;}}
  const remaining=[...required].filter(id=>!chosen.has(id)&&!unreachable.has(id));if(!remaining.length)break;
  const distance=new Map([...chosen].map(id=>[id,0])),toward=new Map<string,string>(),frontier=[...chosen];for(let i=0;i<frontier.length;i++)for(const previous of incoming.get(frontier[i])!)if(!distance.has(previous)){distance.set(previous,distance.get(frontier[i])!+1);toward.set(previous,frontier[i]);frontier.push(previous);}
  const reachable=remaining.filter(id=>distance.has(id)).sort((a,b)=>distance.get(a)!-distance.get(b)!||a.localeCompare(b));
  if(!reachable.length){for(const id of remaining)unreachable.add(id);break;}
  const path=[reachable[0]];while(!chosen.has(path.at(-1)!))path.push(toward.get(path.at(-1)!)!);
  attachments.push(path);for(const id of path)chosen.add(id);for(let i=1;i<path.length;i++)selectedEdges.set(key(path[i-1],path[i]),arcs.get(key(path[i-1],path[i]))!);
 }
 const prerequisiteConflicts:RouteEdge[]=[];for(const edge of edges)if(edge.relation==='prerequisite'&&chosen.has(edge.toNodeId)){
  if(!chosen.has(edge.fromNodeId)||banned.has(key(edge.fromNodeId,edge.toNodeId)))prerequisiteConflicts.push(edge);else selectedEdges.set(key(edge.fromNodeId,edge.toNodeId),edge);
 }
 const prereqs=[...selectedEdges.values()].filter(edge=>edge.relation==='prerequisite'),degrees=new Map([...chosen].map(id=>[id,0]));for(const edge of prereqs)degrees.set(edge.toNodeId,degrees.get(edge.toNodeId)!+1);const ready=[...chosen].filter(id=>degrees.get(id)===0);for(let i=0;i<ready.length;i++)for(const edge of prereqs)if(edge.fromNodeId===ready[i]){degrees.set(edge.toNodeId,degrees.get(edge.toNodeId)!-1);if(degrees.get(edge.toNodeId)===0)ready.push(edge.toNodeId);}const prerequisiteCycle=ready.length!==chosen.size;
 const selected=nodes.filter(node=>chosen.has(node.id)),cos=similarity(nodes),tagDf=new Map<string,number>();for(const node of nodes)for(const tag of new Set(node.tags))tagDf.set(tag,(tagDf.get(tag)??0)+1);
 const checks=[...selectedEdges.values()].map((edge,index)=>{
  const a=nodes.find(node=>node.id===edge.fromNodeId)!,b=nodes.find(node=>node.id===edge.toNodeId)!;
  const union=new Set([...a.tags,...b.tags]);let intersectionWeight=0,unionWeight=0;for(const tag of union){const w=Math.log(1+nodes.length/(tagDf.get(tag)??1));unionWeight+=w;if(a.tags.includes(tag)&&b.tags.includes(tag))intersectionWeight+=w;}const tagScore=unionWeight?intersectionWeight/unionWeight:null;
  const windowIds=[a.id,b.id];for(let i=0;i<windowIds.length&&windowIds.length<6;i++)for(const e of selectedEdges.values())if(e.fromNodeId===windowIds[i]||e.toNodeId===windowIds[i]){const next=e.fromNodeId===windowIds[i]?e.toNodeId:e.fromNodeId;if(!windowIds.includes(next)&&windowIds.length<6)windowIds.push(next);}
  const context=windowIds.filter(id=>id!==a.id&&id!==b.id),textScore=cos(a.id,b.id),contextScore=context.length?context.reduce((sum,id)=>sum+(cos(a.id,id)+cos(b.id,id))/2,0)/context.length:null;
  const reasons:string[]=[];if(a.description.trim().length<12||b.description.trim().length<12)reasons.push('description_insufficient');if(textScore<.12&&(tagScore===null||tagScore<.15))reasons.push('low_lexical_evidence');if(tagScore!==null&&tagScore<.05&&textScore>.35)reasons.push('tag_text_disagreement');if(contextScore!==null&&contextScore<.08)reasons.push('weak_local_context');
  return {id:'connection-'+index,...edge,textScore,tagScore,contextScore,needsReview:reasons.length>0,reasons,windowNodeIds:windowIds};
 });
 return {status:unreachable.size||prerequisiteConflicts.length||prerequisiteCycle?'incomplete' as const:'candidate' as const,backbone,attachments,requiredNodeIds:[...required],nodes:selected,edges:[...selectedEdges.values()],unreachableNodeIds:[...unreachable],prerequisiteConflicts,prerequisiteCycle,checks,reviewQueue:checks.filter(check=>check.needsReview).map(check=>({...check,contextNodes:selected.filter(node=>check.windowNodeIds.includes(node.id))})),note:'候选学习子图，含分支；不保证存在一条从起点经过全部必学点的连续路线。相关边按双向探索使用，不代表先修顺序。局部评分为未经教学标注校准的词汇证据，不是教学质量分数。'};
}
