import test from 'node:test';
import assert from 'node:assert/strict';
import {portraitAtoms} from '../src/morph/atomicPortraitModel.js';
test('画像按原子去重，保留最新已学版本，不以新发布版本覆盖学习证据',()=>{
 const result=portraitAtoms([{id:'a',revision:3,payload:{title:'新版'}},{id:'a',revision:1,stage:'completed',payload:{title:'旧版'}},{id:'a',revision:2,stage:'read',payload:{title:'已读版本',direction:'设计基础',knowledge:['色相']}}]);
 assert.equal(result.length,1);assert.equal(result[0].revision,2);assert.equal(result[0].stage,'read');assert.equal(result[0].direction,'设计基础');
});
test('没有原子证据时不从旧课程或作品推测方向和能力',()=>{
 assert.deepEqual(portraitAtoms([]),[]);assert.equal(portraitAtoms([{id:'b',revision:1,payload:{}}])[0].direction,'待标注');
});
