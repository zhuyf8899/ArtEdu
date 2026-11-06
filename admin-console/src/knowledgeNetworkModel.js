import {pilotGroups,pilotNodes} from '../../shared/knowledgeNetworkPilot.mjs';
export {pilotGroups};
export function positionNetwork(nodes){return nodes.map((node,index)=>{const fixed=pilotNodes.find(item=>item.id===node.id||item.title===node.title);return {...node,x:fixed?.x??120+(index%6)*210,y:fixed?.y??1020+Math.floor(index/6)*150,group:fixed?.group??'other'};});}
export function networkNeighbors(id,edges){return new Set(edges.flatMap(edge=>edge.fromNodeId===id?[edge.toNodeId]:edge.toNodeId===id?[edge.fromNodeId]:[]));}
export function matchesNetworkNode(node,query='',tag='',group=''){
 return (!tag||(node.tags??[]).includes(tag))&&(!group||node.group===group)&&query.trim().toLowerCase().split(/\s+/).every(word=>[node.title,node.description,...(node.tags??[])].join(' ').toLowerCase().includes(word));
}
export function networkCurve(a,b){const dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy)||1;return `M${a.x},${a.y} Q${(a.x+b.x)/2-dy/length*18},${(a.y+b.y)/2+dx/length*18} ${b.x},${b.y}`;}
