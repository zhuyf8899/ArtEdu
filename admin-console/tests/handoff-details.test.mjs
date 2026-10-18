import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {sectionFromPath} from '../src/navigationModel.js';
import {composeCurriculum,courseCardState,courseDirections} from '../src/morph/curriculumModel.js';
import {emptyToolDraft,readToolDraft,toolDraftKey,validateToolDraft} from '../src/morph/toolRecommendation.js';
import {courseProgress,mergeCourseRecord} from '../src/courseProgress.js';
const read=name=>readFile(new URL('../src/'+name,import.meta.url),'utf8');
const codes=['DTH-10','COL-01','TYP-02','GRD-03','INF-13','POS-11','CMF-05','PAR-09','PRD-12'];
const catalog=codes.map((code,i)=>({id:'real-'+i,title:code,estimatedMinutes:30,availability:code==='COL-01'?'trial':'coming_soon',catalog:{code}}));

test('composer restores the handoff entry and a refreshable route without restoring retired graphs',async()=>{
  assert.equal(sectionFromPath('/curriculum/'),'curriculum');
  const source=await read('morph/MorphCatalog.jsx');
  assert.match(source,/onNavigate\('\/curriculum'\)/);
  assert.match(source,/AI 编排课程体系/);
  assert.doesNotMatch(source,/my-learning\?view=portrait|使用方法<select|授课作者<select|创作工具<select|个课时.*c\.method/);
  assert.match(source,/<CatalogControls compact/);
  assert.deepEqual(courseDirections,['全部','设计基础','设计方法','美术史','设计史','软件实操','人工智能基础']);
  const app=await read('App.jsx');assert.match(app,/query\.get\('topic'\)/);
  const component=await read('morph/CurriculumComposer.jsx');
  assert.match(component,/CURRICULUM COMPOSER/);assert.match(component,/模型服务待接入/);
  assert.match(component,/createLearningNote/);assert.match(component,/my-learning\?view=notes/);
  assert.doesNotMatch(component,/enrollCourse|updateLessonProgress|runGenerationJob|localStorage/);
});
test('recommendations resolve stable codes in editorial order with real IDs and readiness preserved',()=>{
  const result=composeCurriculum('我想学习信息图表设计',[...catalog].reverse());
  assert.equal(result.title,'信息图表设计');assert.equal(result.duration,150);
  assert.deepEqual(result.steps.map(s=>s.course.catalog.code),['DTH-10','COL-01','TYP-02','GRD-03','INF-13']);
  assert.equal(result.steps[1].course.id,'real-1');assert.equal(result.steps[0].course.availability,'coming_soon');
  assert.equal(result.steps[0].course.progressPercent,undefined);
  assert.equal(composeCurriculum('海报设计',catalog).steps.at(-1).course.catalog.code,'POS-11');
  assert.deepEqual(composeCurriculum('产品设计',catalog).steps.map(s=>s.course.catalog.code),['DTH-10','CMF-05','PAR-09','PRD-12']);
});
test('unsupported goals, unpublished / archived courses and empty catalogs remain honest and safe',()=>{
  assert.equal(composeCurriculum('音乐编曲',catalog),null);
  const partial=composeCurriculum('海报设计',[catalog[1],{...catalog[0],status:'archived'}]);
  assert.equal(partial.steps.length,1);assert.equal(partial.duration,30);assert.ok(partial.missing.includes('DTH-10'));
  const empty=composeCurriculum('产品设计',[]);assert.equal(empty.steps.length,0);assert.equal(empty.missing.length,4);
});
test('course state uses genuine progress, keeps unopened courses unopened and respects availability',()=>{
  assert.deepEqual(courseCardState({progressPercent:52}),{label:'进行中',tone:'',action:'继续学习'});
  assert.equal(courseCardState({progressPercent:100}).tone,'done');
  assert.equal(courseCardState({progressPercent:0,availability:'trial'}).action,'开始学习');
  assert.equal(courseCardState({progressPercent:100,availability:'coming_soon'}).label,'筹备中');
  assert.equal(courseCardState({archived:true,progressPercent:100}).action,'发现新课程');
  assert.equal(courseCardState({progressPercent:'invalid'}).label,'未开始');
});

test('course progress has the same 0 / 67 / 100 states everywhere without premature completion',()=>{
  for(const [value,label,action,tone] of [[0,'未开始','开始学习','new'],[67,'进行中','继续学习',''],[100,'已完成','回顾课程','done']]) {
    assert.equal(courseProgress({progressPercent:value}),value);
    assert.deepEqual(courseCardState({progressPercent:value}),{label,action,tone});
  }
  assert.equal(courseCardState({progressPercent:99.9}).label,'进行中');
  for(const value of [NaN,Infinity,-Infinity,'invalid',null,undefined,-5]) assert.equal(courseProgress({progressPercent:value}),0);
  assert.equal(courseProgress({progressPercent:'67'}),67);
  assert.equal(courseProgress({progressPercent:110}),100);
});

test('save response updates the existing card without losing metadata or inventing enrollments',()=>{
  const list=[{id:'color',coverImageUrl:'/cover',catalog:{code:'COL-01'},progressPercent:0},{id:'type',progressPercent:0}];
  const updated=mergeCourseRecord(list,{id:'color',progressPercent:67,enrollmentStatus:'in_progress'});
  assert.equal(updated[0].progressPercent,67);assert.equal(updated[0].coverImageUrl,'/cover');
  assert.equal(updated[0].catalog.code,'COL-01');assert.equal(updated[1],list[1]);assert.equal(list[0].progressPercent,0);
  assert.equal(mergeCourseRecord(updated,{id:'color',progressPercent:100})[0].progressPercent,100);
  assert.deepEqual(mergeCourseRecord(list,{id:'unknown',progressPercent:100}),list);
});

test('course mutations synchronize detail, catalog and home, and return navigation reloads authoritative data',async()=>{
  const source=await read('LearningLibrary.jsx'),portal=await read('Portal.jsx'),card=await read('morph/MorphCatalog.jsx'),css=await read('morph/handoff-details.css');
  assert.match(source,/setCourses\(current => mergeCourseRecord\(current, course\)\)/);
  assert.match(source,/onCourseChange\?\.\(course\)/);
  assert.match(source,/requestId === catalogRequest.current/);
  assert.match(source,/loadCatalog\(\).*catalogRequest.current\+\+.*\[initialCourseId\]/);
  for(const fn of ['enrollCourse','updateLessonProgress','submitLessonWork']) assert.match(source,new RegExp(`acceptCourse\\(await ${fn}[^\\n]+true\\)`));
  assert.match(portal,/onCourseChange=\{syncCourse\}/);assert.match(portal,/courses: mergeCourseRecord\(current.courses, course\)/);
  assert.match(card,/courseProgress\(c\)/);assert.match(card,/progress>=100\?' complete'/);assert.match(card,/aria-valuetext=/);
  assert.match(css,/progress.complete::-webkit-progress-value\{background:#388a47\}/);
  assert.match(css,/progress.complete::-moz-progress-bar\{background:#388a47\}/);
});

test('real course card markup renders progress, badge and action from the same saved response',async()=>{
  const [{createServer},React,{renderToStaticMarkup}]=await Promise.all([import('vite'),import('react'),import('react-dom/server')]);
  const server=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom'});
  try {
    const {MorphCourseCard}=await server.ssrLoadModule('/src/morph/MorphCatalog.jsx');
    for(const [progress,label,action] of [[0,'未开始','开始学习'],[67,'进行中','继续学习'],[100,'已完成','回顾课程']]) {
      const html=renderToStaticMarkup(React.createElement(MorphCourseCard,{course:{id:'qa',title:'测试课程',progressPercent:progress,tools:[]},onOpen:()=>{}}));
      assert.match(html,new RegExp(`value="${progress}"`));
      assert.ok(html.includes(label));assert.ok(html.includes(action));
      assert.equal(html.includes('class="progress complete"'),progress===100);
      if(progress>0)assert.ok(!html.includes('未开始'));
    }
  } finally {await server.close();}
});
test('tool recommendation drafts are local, account-isolated and validate safe public URLs',()=>{
  assert.notEqual(toolDraftKey('student'),toolDraftKey('teacher'));
  const entries=new Map([[toolDraftKey('student'),JSON.stringify({title:'工具A',url:'https://example.com',reason:'用于练习'})]]),store={getItem:key=>entries.get(key)};
  assert.equal(readToolDraft(store,'student').title,'工具A');assert.deepEqual(readToolDraft(store,'teacher'),emptyToolDraft());
  assert.deepEqual(readToolDraft({getItem(){throw new Error('storage blocked');}},'s'),emptyToolDraft());
  assert.deepEqual(readToolDraft({getItem:()=>'bad JSON'},'s'),emptyToolDraft());
  assert.equal(validateToolDraft({title:' Figma ',url:'https://figma.com',reason:' 原型练习 '}).title,'Figma');
  for(const url of ['javascript:alert(1)','file:///c:/secret','https://user:pass@example.com','not-a-url'])assert.throws(()=>validateToolDraft({title:'A',url,reason:'B'}));
  assert.throws(()=>validateToolDraft({title:' ',url:'https://example.com',reason:'B'}));
  assert.throws(()=>validateToolDraft({title:'A',url:'https://example.com',reason:'B'.repeat(2001)}));
});
test('recommendation UI uses a native modal with keyboard close and restored focus, never admin publishing',async()=>{
  const source=await read('morph/ToolRecommendationDialog.jsx');
  assert.match(source,/element\.showModal\(\)/);assert.match(source,/onCancel=\{onClose\}/);assert.match(source,/opener\.focus\(\)/);
  assert.match(source,/尚未提交审核或公开发布/);assert.match(source,/role="alert"/);
  assert.doesNotMatch(source,/createToolDirectoryLink|updateToolDirectoryLink|fetch\(/);
  const studio=await read('WorkflowStudio.jsx');assert.match(studio,/推荐一个工具/);assert.match(studio,/accountId=\{accountId\}/);
});
