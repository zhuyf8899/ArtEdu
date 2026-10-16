import test from 'node:test';
import assert from 'node:assert/strict';
import { WorkspaceState, safeUrl, mapCourse, mapWork, mapTool } from '../public/morph/connected-api.js';
test('UI drafts serialize per key and use each committed version',async()=>{
  const calls=[];const store=new WorkspaceState({},async(path,options)=>{calls.push(options.body);await new Promise(resolve=>setTimeout(resolve,2));return {value:options.body.value,version:options.body.version+1};});
  const a=store.set('favorites',[{id:'a',type:'course'}]),b=store.set('favorites',[{id:'b',type:'course'}]);await Promise.all([a,b]);assert.deepEqual(calls.map(c=>c.version),[0,1]);assert.equal(store.get('favorites',[])[0].id,'b');
});
test('failed saves do not turn into successful local state',async()=>{
  const store=new WorkspaceState({profile:{value:{name:'before'},version:3}},async()=>{throw new Error('conflict');});await assert.rejects(store.set('profile',{name:'after'}),/conflict/);assert.equal(store.get('profile',{}).name,'before');
});
test('content adapters preserve database identifiers and real progress',()=>{
  const course=mapCourse({id:'real-course',title:'真实课程',progressPercent:25,creatorName:'真实教师',estimatedMinutes:12});assert.equal(course.id,'real-course');assert.equal(course.progress,25);assert.equal(course.teacher,'真实教师');assert.equal(course.cover,'');
  const work=mapWork({id:'real-work',tags:[{name:'标签'}],tools:['工具'],favorited:true});assert.deepEqual(work.tags,['标签','工具']);assert.equal(work.favorited,true);
  assert.equal(mapTool({id:'tool',href:'javascript:alert(1)'}).href,'');
});
test('resource links reject executable schemes and embedded credentials',()=>{
  for(const value of ['javascript:alert(1)','data:text/html,hello','https://user:password@example.com'])assert.equal(safeUrl(value),'');assert.equal(safeUrl('/api/works/a/assets/b/download'),'/api/works/a/assets/b/download');
});
