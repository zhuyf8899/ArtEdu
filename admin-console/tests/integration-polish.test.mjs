import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadCommunityCatalog, mergeWorkRecord } from '../src/communityData.js';
import { spaceCourseForCard, spaceCourseStatus } from '../src/morph/mySpaceModel.js';
import { curriculumAvailability } from '../src/morph/curriculumModel.js';
import { creationModeDescription } from '../src/morph/morphPresentation.js';

const success=items=>async()=>({items});
const failure=status=>async()=>{throw Object.assign(new Error('unavailable'),{status});};
test('public community survives optional draft/workflow outages but never bypasses authentication',async()=>{
  const result=await loadCommunityCatalog({catalog:success([{id:'public'}]),mine:failure(500),workflows:failure(503)});
  assert.deepEqual(result.works,[{id:'public'}]);assert.deepEqual(result.myWorks,[]);
  assert.match(result.supportError,/草稿/);assert.match(result.supportError,/工作流/);
  for(const status of [401,403])await assert.rejects(loadCommunityCatalog({catalog:success([]),mine:failure(status),workflows:success([])}),error=>error.status===status);
  await assert.rejects(loadCommunityCatalog({catalog:failure(500),mine:success([]),workflows:success([])}));
});
test('work updates synchronize existing cards without adding private drafts to public collections',()=>{
  const old=[{id:'public',likeCount:1}];
  assert.deepEqual(mergeWorkRecord(old,{id:'public',likeCount:2}),[{id:'public',likeCount:2}]);
  assert.deepEqual(mergeWorkRecord(old,{id:'private',status:'draft'}),old);assert.equal(old[0].likeCount,1);
});
test('my courses use canonical authors and separate enrolled-but-unstarted courses',()=>{
  assert.equal(spaceCourseForCard({id:'c',catalog:{authorLabel:'课程作者'},creatorName:'上传账号'}).author,'课程作者');
  for(const [progressPercent,status] of [[0,'new'],[67,'progress'],[100,'complete']])assert.equal(spaceCourseStatus({progressPercent}),status);
  assert.equal(spaceCourseStatus({progressPercent:67,archived:true}),'archived');
});
test('curriculum starts at an available unfinished course and never launches planned/archived courses',()=>{
  const result=curriculumAvailability({steps:[{course:{id:'planned',availability:'coming_soon'}},{course:{id:'done',progressPercent:100}},{course:{id:'next',availability:'trial',progressPercent:67}},{course:{id:'old',archived:true}}]});
  assert.equal(result.nextCourse.id,'next');assert.equal(result.availableCount,2);assert.equal(result.plannedCount,2);assert.equal(result.review,false);
  assert.equal(curriculumAvailability({steps:[{course:{id:'done',progressPercent:100}}]}).review,true);
  assert.equal(curriculumAvailability({steps:[{course:{availability:'coming_soon'}}]}).nextCourse,null);
  assert.equal(curriculumAvailability().nextCourse,null);
});
test('model execution copy distinguishes disabled execution from missing configuration',()=>{
  assert.match(creationModeDescription({enabled:false}),/本地演示/);
  assert.doesNotMatch(creationModeDescription({enabled:false}),/未配置/);
  assert.match(creationModeDescription({enabled:true}),/已开启/);
});
test('community routes, async guards and desktop layout fixes remain wired',async()=>{
  const source=await readFile(new URL('../src/CommunityLibrary.jsx',import.meta.url),'utf8');
  assert.match(source,/initialWorkId/);assert.match(source,/encodeURIComponent\(work.id\)/);
  assert.match(source,/setDetailRetry/);assert.match(source,/if\(interactionBusy\) return/);
  assert.match(source,/mergeWorkRecord/);assert.match(source,/catalogRequest.current/);
  const css=await readFile(new URL('../src/morph/integration-polish.css',import.meta.url),'utf8');
  assert.match(css,/1150px/);assert.match(css,/1199px/);assert.match(css,/placeholder/);
  const space=await readFile(new URL('../src/morph/MorphMySpace.jsx',import.meta.url),'utf8');
  assert.match(space,/还没有加入课程/);assert.match(space,/spaceCourseStatus/);
});
