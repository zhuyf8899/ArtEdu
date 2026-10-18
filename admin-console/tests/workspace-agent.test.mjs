import test from 'node:test';import assert from 'node:assert/strict';
import {resolveCreationOperation} from '../src/creationMethods.js';
import {makeModelContext,taskStateFor} from '../src/conversationStore.js';
import {appendActivity,visibleActivities,activityLabel} from '../src/agentActivity.js';
test('否定与格式讨论不生成文件，复合请求交给Agent判断全部产物',()=>{
 for(const prompt of ['不要生成图片，只解释海报构图','解释 PDF 和 Word 的区别','给我一份PPT大纲，不要生成文件','生成Word教案和课程介绍网页'])assert.equal(resolveCreationOperation(prompt).jobType,'chat');
});
test('重试上下文只取选中分支，记忆与产物状态保留独立预算',()=>{
 const base=[{role:'user',content:'紫色课程'},{role:'assistant',content:'已保存页面',delivery:{artifacts:[{kind:'webpage',path:'index.html'}]}}];
 const conversation={memory:'既有课程目标',messages:[...base,{role:'assistant',content:'ABANDONED_RED_BRANCH',delivery:{artifacts:[{kind:'webpage',path:'red.html'}]}}]};
 const context=makeModelContext(conversation,base);assert.ok(!JSON.stringify(context).includes('ABANDONED_RED_BRANCH'));assert.ok(!JSON.stringify(context).includes('red.html'));assert.ok(context.some(m=>m.content.includes('index.html')));
 const long=makeModelContext({...conversation,messages:[...base,...Array.from({length:48},()=>({role:'user',content:'继续'}))]});assert.equal(long.length,30);assert.ok(long.some(m=>m.content.includes('既有课程目标')));assert.ok(long.some(m=>m.content.includes('index.html')));assert.equal(taskStateFor(base).artifacts[0].path,'index.html');
});
test('部分完成、检查失败、暂停和待确认均有明确进度标签',()=>{
 for(const [status,label] of [['partial','部分完成'],['validation_failed','检查未通过'],['paused','已暂停'],['needs_confirmation','等待确认']]){const events=appendActivity([],{id:'run',name:'agent.execute',kind:'run',status});assert.equal(visibleActivities(events).length,1);assert.ok(activityLabel(events[0]).includes(label));}
});
