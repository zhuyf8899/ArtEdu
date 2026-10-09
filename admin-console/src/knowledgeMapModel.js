export function knowledgeLayout(nodes,edges) {
 const levels=new Map(nodes.map(n=>[n.id,0])),incoming=new Map(nodes.map(n=>[n.id,0])),out=new Map(nodes.map(n=>[n.id,[]]));
 for(const e of edges)if(e.relation==='prerequisite'&&levels.has(e.fromNodeId)&&levels.has(e.toNodeId)){out.get(e.fromNodeId).push(e.toNodeId);incoming.set(e.toNodeId,incoming.get(e.toNodeId)+1);}
 const queue=nodes.filter(n=>incoming.get(n.id)===0).map(n=>n.id);
 for(let i=0;i<queue.length;i++)for(const next of out.get(queue[i])){levels.set(next,Math.max(levels.get(next),levels.get(queue[i])+1));incoming.set(next,incoming.get(next)-1);if(incoming.get(next)===0)queue.push(next);}
 const rows=new Map();const flat=[...levels.values()].every(v=>v===0);const positions=nodes.map((n,index)=>{const level=flat?index%4:levels.get(n.id),row=rows.get(level)??0;rows.set(level,row+1);return {...n,x:120+level*250,y:70+row*130};});
 return {nodes:positions,width:Math.max(600,...positions.map(n=>n.x+130)),height:Math.max(160,...positions.map(n=>n.y+70))};
}
