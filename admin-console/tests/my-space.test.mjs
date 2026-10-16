import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {mySpaceView,spaceEvidence,isCollectedWork,SPACE_VIEWS,enrichFavoriteRecords} from '../src/morph/mySpaceModel.js';

test('my space defaults to overview and retires old graph links without deleting data',()=>{
  assert.equal(mySpaceView('',''),'overview');
  assert.equal(mySpaceView('notes',''),'notes');
  assert.equal(mySpaceView('unknown',''),'overview');
  for(const atlas of ['reference','course','personal'])assert.equal(mySpaceView('',atlas),'portrait');
  assert.ok(!SPACE_VIEWS.includes('graph'));
});
test('professional portrait uses completed lesson evidence, not enrollment or draft tasks as mastery',()=>{
  const result=spaceEvidence({courses:[{id:'c',category:'设计基础'}],learningLessons:[{id:'a',title:'已学内容',knowledgePoints:['观察'],progressPercent:100},{id:'b',title:'尚未学习',knowledgePoints:['建模'],progressPercent:20}],tasks:[{status:'completed',title:'实践'}]});
  assert.deepEqual(result.directions,['设计基础']);assert.ok(result.topics.includes('观察'));
  assert.ok(!result.topics.includes('建模'));assert.equal(result.completedLessons.length,1);
  assert.ok(!('abilityScore' in result));
});
test('collected cases retain separate identity from original creation records',()=>{
  const result=spaceEvidence({works:[{id:'a',story:{origin:'collected'},createdAt:'2026-10-12',title:'外部作品'},{id:'b',title:'我的作品',createdAt:'2026-10-13'}]});
  assert.equal(result.collected.length,1);assert.equal(result.originals.length,1);
  assert.equal(isCollectedWork(result.collected[0]),true);
  assert.equal(result.activity.find(x=>x.id==='work-a').label,'整理案例');
  assert.match(result.activity[0].href,/work=b/);
});
test('empty and malformed learning records yield honest empty evidence',()=>{
  assert.deepEqual(spaceEvidence().topics,[]);
  assert.deepEqual(spaceEvidence({learningLessons:{},works:null,workflowRuns:[{id:'r',updatedAt:'invalid',learningBindings:{tools:[{name:'Figma'},'Figma']}}]}).declaredTools,['Figma']);
  assert.equal(spaceEvidence({notes:[{createdAt:'invalid'}]}).activity.length,0);
});
test('favorite covers use the canonical public catalog without adding unfavorited records',()=>{
  const favorites=enrichFavoriteRecords([{id:'mine',title:'收藏',previewUrl:null}],[{id:'mine',previewUrl:'/api/media/cover',creators:['原作者']},{id:'other',previewUrl:'/other.jpg'}]);
  assert.equal(favorites.length,1);assert.equal(favorites[0].id,'mine');assert.equal(favorites[0].previewUrl,'/api/media/cover');assert.deepEqual(favorites[0].creators,['原作者']);
  assert.deepEqual(enrichFavoriteRecords([],[]),[]);
});
test('new space preserves private service requests, route state, and no static demo identity',async()=>{
  const root=new URL('../src/',import.meta.url);
  const learning=await readFile(new URL('MyLearning.jsx',root),'utf8');
  assert.match(learning,/getMyWorks\(\)/);assert.match(learning,/workLoadError/);assert.match(learning,/requestId !== loadRequest.current/);
  assert.match(learning,/data.profile\?\.id === account.id/);assert.match(learning,/variant === 'morph'/);
  const shell=await readFile(new URL('morph/MorphMySpace.jsx',root),'utf8');
  assert.match(shell,/我的专业画像/);assert.doesNotMatch(shell,/localStorage|王婧|86%|342|<LearningGraph|<CurriculumAtlas/);
  assert.match(shell,/data\.workLoadError/);assert.match(shell,/aria-controls="morph-space-content"/);
  const chrome=await readFile(new URL('morph/MorphChrome.jsx',root),'utf8');assert.doesNotMatch(chrome,/知识图谱/);
  const catalog=await readFile(new URL('morph/MorphCatalog.jsx',root),'utf8');assert.doesNotMatch(catalog,/课程知识图谱|atlas=reference/);
});
