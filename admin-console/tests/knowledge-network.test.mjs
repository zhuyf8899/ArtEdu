import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pilotNodes,pilotLinks} from '../../shared/knowledgeNetworkPilot.mjs';
import {positionNetwork,networkNeighbors,matchesNetworkNode} from '../src/knowledgeNetworkModel.js';
test('manual sample contains 30 real IDs, partial tagging and a connected cyclic network with cross-domain links',()=>{
 assert.equal(pilotNodes.length,30);assert.equal(new Set(pilotNodes.map(node=>node.id)).size,30);assert.equal(pilotNodes.filter(node=>node.tags.length).length,12);
 const titles=new Set(pilotNodes.map(node=>node.title));const seen=new Set([pilotNodes[0].title]);
 for(const [a,b]of pilotLinks){assert.ok(titles.has(a)&&titles.has(b)&&a!==b);}
 for(let i=0;i<30;i++)for(const [a,b]of pilotLinks){if(seen.has(a))seen.add(b);if(seen.has(b))seen.add(a);}
 assert.equal(seen.size,30);assert.ok(pilotLinks.length>30);
 assert.ok(pilotLinks.filter(([a,b])=>pilotNodes.find(n=>n.title===a).group!==pilotNodes.find(n=>n.title===b).group).length>=10);
 for(const a of pilotNodes)for(const b of pilotNodes)if(a!==b)assert.ok(Math.hypot(a.x-b.x,a.y-b.y)>95);
});
test('manual positions survive a node rename; unknown nodes remain available for later placement',()=>{
 const original=pilotNodes[0];const [renamed,extra]=positionNetwork([{id:original.id,title:'教师更新名称'},{id:'extra',title:'新增知识'}]);
 assert.equal(renamed.x,original.x);assert.equal(renamed.y,original.y);assert.ok(Number.isFinite(extra.x)&&Number.isFinite(extra.y));
});
test('neighbors support undirected exploration and tag/text/group filters can combine without replacing graph data',()=>{
 const edges=[{fromNodeId:'a',toNodeId:'b'},{fromNodeId:'c',toNodeId:'a'}];assert.deepEqual([...networkNeighbors('a',edges)].sort(),['b','c']);
 const node={title:'用户观察',description:'访谈与情境',tags:['观察','研究方法'],group:'research'};
 assert.equal(matchesNetworkNode(node,'用户 访谈','观察','research'),true);assert.equal(matchesNetworkNode(node,'用户','色彩','research'),false);
});
