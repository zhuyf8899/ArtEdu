import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { atomicSourceTitle,atomicAuthoringActions,canReviewAtomic,atomicStepLabel,atomicCourseProgress,moveAtomicStep,atomicUrl } from '../src/atomicModel.js';

test('列表直接创建不要求先打开详情，从详情分享则保留源原子标题',()=>{
 assert.equal(atomicSourceTitle(undefined,null),'');assert.equal(atomicSourceTitle(undefined,{id:undefined}),'');
 assert.equal(atomicSourceTitle('one',{id:'one',payload:{title:'色彩对比'}}),'色彩对比');
 assert.equal(atomicSourceTitle('other',{id:'one',payload:{title:'色彩对比'}}),'');
});

test('学生在我的原子学习/我的贡献中可上传心得，但没有教师原子与课程创建权限',()=>{
 for(const view of ['learning','mine'])assert.deepEqual(atomicAuthoringActions(['student'],view),{canTeach:false,canReflect:true});
 assert.deepEqual(atomicAuthoringActions(['student'],'courses'),{canTeach:false,canReflect:false});
 assert.deepEqual(atomicAuthoringActions(['teacher'],'learning'),{canTeach:true,canReflect:true});
});
test('列表心得入口独立于教师按钮，支持关联已学/已发布原子并沿用附件审核流程',async()=>{
 const hub=await readFile(new URL('../src/AtomicLearningHub.jsx',import.meta.url),'utf8');
 assert.match(hub,/canReflect&&<button[\s\S]*?上传心得/);
 for(const text of ['ReflectionSourcePicker','我的已学原子','全部已发布原子','上传学习心得','reflectionSource.id','parentId=editor.parentId',"reflection?'心得附件':'教学附件'",'保存后进入“我的贡献”','Boolean(savedDraft)'])assert.ok(hub.includes(text),text);
 assert.match(hub,/if\(reflection&&!reflectionSource.id\)throw Error/);
});

test('教师具有心得审核入口，学生没有审核入口，具体权限由服务端返回',async()=>{
 for(const role of ['teacher','admin','operator'])assert.equal(canReviewAtomic([role]),true);
 assert.equal(canReviewAtomic(['student']),false);assert.equal(canReviewAtomic([]),false);
 const hub=await readFile(new URL('../src/AtomicLearningHub.jsx',import.meta.url),'utf8');
 assert.match(hub,/detail.canReview&&<ReviewForm/);
 assert.match(hub,/useState\('atoms'\),\[search/);
 for(const text of ['刷新列表',"onNavigate('/learning?library=review')",'关联原子：','visibilitychange','!lock.current'])assert.ok(hub.includes(text),text);
 const admin=await readFile(new URL('../src/AdminDashboard.jsx',import.meta.url),'utf8');
 assert.match(admin,/原子 \/ 课程 \/ 心得审核/);assert.match(admin,/AtomicReviewPanel account=\{actor\}/);
});
test('共享原子记录复用，课程专属任务独立计入，选修不虚增必修完成度',()=>{
 const shared={atomId:'color',available:true,required:true,stage:'completed'};
 assert.equal(atomicCourseProgress([shared]).percent,100);
 assert.equal(atomicCourseProgress([{...shared,task:'设计一份课程海报'}]).percent,0);
 assert.equal(atomicStepLabel({...shared,task:'设计一份课程海报'}),'原子已学，课程任务待完成');
 assert.equal(atomicCourseProgress([{...shared,task:'设计一份课程海报',taskProgress:{stage:'submitted'}}]).percent,0);
 assert.equal(atomicCourseProgress([{...shared,task:'设计一份课程海报',taskProgress:{stage:'completed'}},{...shared,atomId:'optional',required:false,stage:'read'}]).percent,100);
 assert.equal(atomicCourseProgress([{...shared,available:false}]).percent,0);
 assert.equal(atomicCourseProgress([]).percent,0);
});
test('编排移动不改变原数组或版本，课程与原子链接保存选择版本',()=>{
 const steps=[{atomId:'one',revision:1},{atomId:'two',revision:2}];assert.equal(moveAtomicStep(steps,0,-1),steps);
 assert.deepEqual(moveAtomicStep(steps,1,-1),[steps[1],steps[0]]);assert.equal(steps[0].atomId,'one');
 assert.equal(atomicUrl('abc',2,'courses'),'/learning?library=courses&node=abc&revision=2');
});
test('真实 API、既有课程保留、审核/教学评价及文件授权预览接线',async()=>{
 const hub=await readFile(new URL('../src/AtomicLearningHub.jsx',import.meta.url),'utf8');
 for(const text of ['atomicRequest','uploadAtomicFile','DocumentPreviewDialog','原有课程','先修提示不锁定学习','我的贡献','内容审核','练习评价','提交审核'])assert.ok(hub.includes(text),text);
 assert.ok(!/dangerouslySetInnerHTML|localStorage/.test(hub));
 const portal=await readFile(new URL('../src/Portal.jsx',import.meta.url),'utf8');assert.match(portal,/AtomicLearningHub[\s\S]*legacy=\{<LearningLibrary/);
});
