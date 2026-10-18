import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {filterAdminCourses,ADMIN_COURSE_FILTERS} from '../src/adminCourseCatalog.js';
import {toolCategoryName} from '../src/morph/morphPresentation.js';
import {quotaDraft,quotaDraftChanges,validQuotaDraft,quotaInputValue} from '../src/adminQuotaModel.js';
const source=file=>readFile(new URL('../src/'+file,import.meta.url),'utf8');
const courses=[{id:'a',title:'色彩构成',category:'设计基础',status:'published',availability:'trial',catalog:{authorLabel:'课程作者'}},{id:'b',title:'产品设计',category:'设计方法',status:'published',availability:'coming_soon'},{id:'old',title:'旧课',status:'archived'},{id:'draft',title:'草稿',status:'draft'}];
test('admin course filters combine status, direction and canonical author without deleting history',()=>{
  assert.equal(filterAdminCourses(courses).length,4);
  assert.deepEqual(filterAdminCourses(courses,{status:'trial'}).map(c=>c.id),['a']);
  assert.deepEqual(filterAdminCourses(courses,{query:'课程作者',category:'设计基础'}).map(c=>c.id),['a']);
  assert.deepEqual(filterAdminCourses(courses,{status:'coming_soon'}).map(c=>c.id),['b']);
  assert.deepEqual(filterAdminCourses(courses,{status:'archived'}).map(c=>c.id),['old']);
  assert.deepEqual(filterAdminCourses(courses,{query:'色彩 作者',status:'draft'}),[]);
  assert.ok(ADMIN_COURSE_FILTERS.some(([value])=>value==='pending_review'));
  assert.equal(courses.length,4);
  assert.equal(filterAdminCourses(courses).at(-1).id,'old');
});
test('legacy tool category labels use the handoff name without mutating stored records',()=>{
  assert.equal(toolCategoryName('灵感与素材'),'灵感与资源');assert.equal(toolCategoryName('3D 与动态'),'3D 与动态');
});
test('quota drawer starts from actual account limits and never silently replaces unlimited with defaults or zero',()=>{
  const user={dailyLimit:20,monthlyLimit:null,concurrentLimit:null},draft=quotaDraft(user);
  assert.deepEqual(draft,{dailyLimit:20,monthlyLimit:'',concurrentLimit:''});
  assert.deepEqual(quotaDraftChanges(user,draft),[]);assert.equal(validQuotaDraft(draft),false);assert.equal(quotaInputValue(''),null);
  assert.equal(validQuotaDraft({dailyLimit:20,monthlyLimit:600,concurrentLimit:2}),true);
  for(const value of [-1,1.5,'abc',100001])assert.equal(validQuotaDraft({dailyLimit:value,monthlyLimit:600,concurrentLimit:2}),false);
  assert.deepEqual(quotaDraft({dailyLimit:0,monthlyLimit:0,concurrentLimit:0}),{dailyLimit:0,monthlyLimit:0,concurrentLimit:0});
});
test('unified theme extends handoff tokens to admin, creation, canvas and body portals without replacing assets',async()=>{
  const css=await source('morph/platform-unified.css');
  for(const text of ['#111838','#6554e8','#d8f845','#e2e0f6','.admin-shell','.creation-canvas','.image-canvas-page','.feedback-dialog','.review-dialog','.course-modal--wide'])assert.ok(css.includes(text),text);
  assert.doesNotMatch(css,/\.image-lightbox\s*\{|\.comfy-node\s*\{/);
  assert.match(await source('App.jsx'),/classList.add\('morph-platform'\)/);
});
test('unsaved forms guard SPA navigation, refresh and editor closing while saves remain explicit',async()=>{
  const guard=await source('useUnsavedChanges.js');
  assert.match(guard,/beforeunload/);assert.match(guard,/confirmAction/);assert.match(guard,/if\(!confirmed\)return false/);assert.match(guard,/state.current.busy/);
  assert.doesNotMatch(guard,/localStorage|sessionStorage|fetch\(/);
  assert.match(await source('routing.js'),/skipGuard:true/);
  for(const file of ['MyLearning.jsx','CaseStoryEditor.jsx','AdminCourses.jsx'])assert.match(await source(file),/useUnsavedChanges/);
});
test('workflow and admin catalogs distinguish loading/failure from empty and ignore stale results',async()=>{
  const workflow=await source('WorkflowStudio.jsx');
  assert.match(workflow,/catalogState==='ready'&&/);assert.match(workflow,/重新加载工作流/);assert.match(workflow,/requestId!==catalogRequest.current/);
  const admin=await source('AdminCourses.jsx');assert.match(admin,/Promise.allSettled/);assert.match(admin,/requestId!==request.current/);assert.match(admin,/管理课程状态/);
  assert.match(await source('RuntimeStatus.jsx'),/<details/);
});
test('workflow preview fits the whole graph before a run and follows active nodes only during execution',async()=>{
  const runner=await source('WorkflowRunner.jsx');
  assert.match(runner,/else flowRef.current\?\.fitView/);
  assert.match(runner,/useEffect\(\(\) => \{ focusNode\(activeId\)/);
  assert.doesNotMatch(runner,/onInit=\{[^\n]+startWorkflowRun/);
  const editor=await source('WorkflowAdmin.jsx');
  assert.match(editor,/\.map\(\(node\) => \(\{ \.\.\.node, dragHandle: "\.drag-handle"/);
  assert.doesNotMatch(editor,/<ReactFlow[^>]* dragHandle=/);
  assert.match(await source('CreationWorkspace.jsx'),/if\(!messages.length\)\{node.scrollTo\(\{top:0/);
});
