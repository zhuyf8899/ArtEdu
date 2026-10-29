import test from 'node:test';
import assert from 'node:assert/strict';
import {graphLimitIssue,layoutGraph,groupBounds,requiredNodeIds,skipNode} from '../../shared/workflowGraph.mjs';
const node=(id,x=0,y=0)=>({id,type:'note',position:{x,y},data:{}});
test('layout uses measured column widths and tall node heights without overlap',()=>{
 const graph={nodes:[node('a'),node('b'),node('out')],edges:[{source:'a',target:'out'},{source:'b',target:'out'}]};
 const measured=[{id:'a',measured:{width:600,height:900}},{id:'b',measured:{width:300,height:500}},{id:'out',measured:{width:300,height:250}}];
 const layout=layoutGraph(graph,measured);assert.ok(layout[1].position.y>=layout[0].position.y+990);assert.ok(layout[2].position.x>=layout[0].position.x+700);
 const bounds=groupBounds({...graph,nodes:layout,groups:[{id:'g',nodeIds:['a','b']}]},measured)[0];assert.ok(bounds.height>=900+90+500+48);assert.ok(bounds.width>=648);
});
test('every graph mutation can enforce node, edge and group caps before saving',()=>{
 const graph={nodes:Array.from({length:80},(_,i)=>node(String(i))),edges:Array.from({length:160},()=>({})),groups:Array.from({length:20},()=>({}))};
 assert.equal(graphLimitIssue(graph),'');assert.match(graphLimitIssue({...graph,nodes:[...graph.nodes,node('81')]}),/80/);assert.match(graphLimitIssue({...graph,edges:[...graph.edges,{}]}),/160/);assert.match(graphLimitIssue({...graph,groups:[...graph.groups,{}]}),/20/);
});
test('lazy selection preserves shared ancestors and branches used by other outputs',()=>{
 const graph={nodes:['root','a','b','select','out','other'].map(id=>({...node(id),...(id==='select'?{type:'result_select',data:{selection:'a'}}:{})})),edges:[{source:'root',target:'a'},{source:'root',target:'b'},{source:'a',target:'select',targetHandle:'a'},{source:'b',target:'select',targetHandle:'b'},{source:'select',target:'out'},{source:'b',target:'other'}]};
 assert.equal(requiredNodeIds(graph).size,6);graph.edges.pop();graph.nodes.pop();assert.equal(requiredNodeIds(graph).has('b'),false);assert.equal(requiredNodeIds(graph).has('root'),true);
});
test('skipped upload/input branches can advance without requesting user input',()=>{
 const graph={nodes:[node('c'),{...node('image'),type:'load_image'}],edges:[{source:'c',target:'image',sourceHandle:'false'}]};
 assert.equal(skipNode(graph,'image',{c:{kind:'condition',matched:true}}),true);assert.equal(skipNode(graph,'image',{}),false);
});
