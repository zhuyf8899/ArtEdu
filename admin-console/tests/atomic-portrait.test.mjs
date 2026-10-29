import test from 'node:test';
import assert from 'node:assert/strict';
import {portraitAtoms,buildPortrait,isVerifiedPractice,portraitRecommendation,withinPortraitRange} from '../src/morph/atomicPortraitModel.js';
test('画像按原子去重，保留最新已学版本，不以新发布版本覆盖学习证据',()=>{
 const result=portraitAtoms([{id:'a',revision:3,payload:{title:'新版'}},{id:'a',revision:1,stage:'completed',payload:{title:'旧版'}},{id:'a',revision:2,stage:'read',payload:{title:'已读版本',direction:'设计基础',knowledge:['色相']}}]);
 assert.equal(result.length,1);assert.equal(result[0].revision,2);assert.equal(result[0].stage,'read');assert.equal(result[0].direction,'设计基础');
});
test('没有原子证据时不从旧课程或作品推测方向和能力',()=>{
 assert.deepEqual(portraitAtoms([]),[]);assert.equal(portraitAtoms([{id:'b',revision:1,payload:{}}])[0].direction,'待标注');
});

const now=Date.parse('2026-10-29T12:00:00Z');
const row=(id,stage,overrides={})=>({id,revision:1,stage,updatedAt:'2026-10-28T12:00:00Z',payload:{title:id,direction:'设计基础',completion:'read',knowledge:['色彩']},...overrides});
const axis=profile=>profile.axes.find(a=>a.direction==='设计基础');
const routeFor=steps=>({payload:{steps}});
test('学习覆盖只统计已开始原子；新增目录不会改变分母',()=>{
 const rows=[row('a','completed'),row('b','read')];
 const before=buildPortrait({rows}),after=buildPortrait({rows:[...rows,row('c',null)]});
 assert.equal(axis(before).percent,50);assert.equal(axis(after).percent,50);assert.equal(after.total,2);
 assert.ok(buildPortrait().axes.every(a=>a.percent===null));
});
test('共享原子和重复知识绑定不重复计分；练习需精确版本的教师证据',()=>{
 const a=row('a','completed',{payload:{direction:'设计基础',completion:'practice'}});
 const e={atomId:'a',revision:1,stage:'completed',completion:'practice',reviewerId:'teacher'};
 assert.equal(isVerifiedPractice(a,[{...e,reviewerId:null}]),false);
 assert.equal(isVerifiedPractice(a,[{...e,revision:2}]),false);
 assert.equal(isVerifiedPractice({...a,stage:'submitted'},[e]),false);
 assert.equal(isVerifiedPractice({...a,completion:'practice'},[e]),true);
 const p=buildPortrait({rows:[a,a],evidence:[e,e],mode:'practice'});
 assert.equal(p.verified,1);assert.equal(p.total,1);assert.equal(axis(p).percent,100);
});
test('阅读、自主完成与教师验证分别计算',()=>{
 const rows=[row('read','completed'),row('practice','submitted',{payload:{completion:'practice',direction:'设计基础'}})];
 const p=buildPortrait({rows,mode:'practice'});assert.equal(p.completed,1);assert.equal(p.submitted,1);assert.equal(p.verified,0);assert.equal(axis(p).percent,0);
});
test('旧课时 2/3 显示 67% 课时完成，不能转成原子能力证据',()=>{
 const legacyCourses=[{id:'old',category:'设计基础',lessonCount:3,completedLessons:2,progressPercent:67}];
 const p=buildPortrait({legacyCourses,source:'legacy'});assert.equal(axis(p).percent,67);assert.equal(p.verified,0);assert.equal(p.total,3);assert.equal(buildPortrait({legacyCourses}).total,0);
});
test('固定路线按精确版本统计；新版完成不继承到旧版',()=>{
 const route=routeFor([{atomId:'a',revision:1},{atomId:'a',revision:1},{atomId:'b',revision:1}]);
 const rows=[row('a',null),row('a','completed',{revision:2}),row('b','completed')];
 const p=buildPortrait({rows,source:'route',route});assert.equal(p.total,2);assert.equal(axis(p).percent,50);assert.equal(p.scope.find(a=>a.id==='a').revision,1);
});
test('缺失固定版本时禁止以部分记录生成满分比例和路线建议',()=>{
 const route=routeFor([{atomId:'a',revision:1},{atomId:'missing',revision:1}]);
 for(const days of [0,7]){
  const p=buildPortrait({rows:[row('a','completed')],source:'route',route,days,now});
  assert.equal(p.missing,1);assert.ok(p.axes.every(a=>a.percent===null));assert.equal(portraitRecommendation({profile:p,source:'route',route}),null);
 }
});
test('日期筛选排除缺失日期、未来和过期记录，标签表示最近更新',()=>{
 assert.equal(withinPortraitRange('not-a-date',7,now),false);assert.equal(withinPortraitRange('2026-10-30',7,now),false);
 const p=buildPortrait({rows:[row('recent','read'),row('old','completed',{updatedAt:'2026-09-01'}),row('unknown','completed',{updatedAt:null})],days:7,now});
 assert.equal(p.total,1);assert.equal(p.completed,0);
});
test('路线推荐考虑日期范围外和可选原子的先修记录',()=>{
 const route=routeFor([{atomId:'a',revision:1,required:false},{atomId:'b',revision:1,prerequisites:['a']}]);
 const rows=[row('a','completed',{updatedAt:'2026-01-01'}),row('b',null)];
 const p=buildPortrait({rows,source:'route',route,days:7,now});assert.equal(p.total,0);
 assert.equal(portraitRecommendation({profile:p,source:'route',route}).item.id,'b');
 const notComplete=buildPortrait({rows:[{...rows[0],stage:'read'},rows[1]],source:'route',route});
 assert.equal(portraitRecommendation({profile:notComplete,source:'route',route}),null);
});
test('优先处理待修改与已读原子；已提交不会要求重复提交',()=>{
 const rows=[row('waiting','submitted'),row('reading','read'),row('revise','needs_revision',{feedback:'补充分析依据'})];
 let p=buildPortrait({rows});let r=portraitRecommendation({profile:p,source:'records'});assert.equal(r.item.id,'revise');assert.equal(r.reason,'补充分析依据');
 p=buildPortrait({rows:rows.slice(0,2)});r=portraitRecommendation({profile:p,source:'records'});assert.equal(r.item.id,'reading');
 p=buildPortrait({rows:rows.slice(0,1)});r=portraitRecommendation({profile:p,source:'records'});assert.equal(r.waiting,true);
});
test('新用户推荐完整课程；旧课推荐不能指向已归档课程',()=>{
 const p=buildPortrait({rows:[row('unstarted',null)]});
 assert.equal(portraitRecommendation({profile:p,source:'records',courses:[{id:'course'}]}).kind,'course');
 const legacyCourses=[{id:'archived',archived:true,progressPercent:67},{id:'active',progressPercent:30}];
 assert.equal(portraitRecommendation({profile:p,source:'legacy',legacyCourses}).item.id,'active');
});
