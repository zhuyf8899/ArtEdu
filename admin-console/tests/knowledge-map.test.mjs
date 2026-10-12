import test from 'node:test';import assert from 'node:assert/strict';import {knowledgeLayout} from '../src/knowledgeMapModel.js';
import {readFile} from 'node:fs/promises';
test('知识库错误和空状态保留课程参考图谱入口，不代填学习记录',async()=>{
 const code=await readFile(new URL('../src/KnowledgeMap.jsx',import.meta.url),'utf8');
 const errorState=code.slice(code.indexOf('if(error)return'),code.indexOf('if(!data)return'));
 const emptyState=code.slice(code.indexOf('{!map.nodes.length?'),code.indexOf(':<div className="knowledge-live__layout">'));
 for(const state of [errorState,emptyState])assert.match(state,/onNavigate\('\/my-learning\?atlas=reference'\)/);
 assert.match(emptyState,/并非加载失败/);
 assert.match(emptyState,/不会代填个人掌握度或完成记录/);
});
test('知识关系布局将前置放在后续之前，并保留孤立节点',()=>{const nodes=[{id:'c'},{id:'a'},{id:'b'},{id:'alone'}];const l=knowledgeLayout(nodes,[{fromNodeId:'a',toNodeId:'b',relation:'prerequisite'},{fromNodeId:'b',toNodeId:'c',relation:'prerequisite'}]);const pos=id=>l.nodes.find(n=>n.id===id);assert.ok(pos('a').x<pos('b').x);assert.ok(pos('b').x<pos('c').x);assert.equal(l.nodes.length,4);});
test('相关关系和失效关系不伪造前置，空图与异常历史环不导致死循环',()=>{assert.equal(knowledgeLayout([],[]).nodes.length,0);const l=knowledgeLayout([{id:'a'},{id:'b'}],[{fromNodeId:'a',toNodeId:'b',relation:'related'},{fromNodeId:'missing',toNodeId:'b',relation:'prerequisite'}]);assert.ok(l.nodes.every(n=>Number.isFinite(n.x)&&Number.isFinite(n.y)));assert.equal(knowledgeLayout([{id:'a'},{id:'b'}],[{fromNodeId:'a',toNodeId:'b',relation:'prerequisite'},{fromNodeId:'b',toNodeId:'a',relation:'prerequisite'}]).nodes.length,2);});
