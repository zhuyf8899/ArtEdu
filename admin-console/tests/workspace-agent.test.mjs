import test from 'node:test';import assert from 'node:assert/strict';
import {resolveCreationOperation} from '../src/creationMethods.js';
import {makeModelContext,taskStateFor} from '../src/conversationStore.js';
import {appendActivity,visibleActivities,activityLabel,executionSummary} from '../src/agentActivity.js';
import {readFile} from 'node:fs/promises';
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
test('折叠摘要展示当前活动、去重记录数，并优先保留真实终态',()=>{
 assert.equal(executionSummary([]),null);
 const run={id:'run',kind:'run',name:'agent.execute',status:'running'};
 const tool={id:'image',kind:'tool',name:'generate_image',status:'running'};
 assert.deepEqual(executionSummary([run,tool]),{label:'生成图片：进行中',status:'running',count:2});
 const completed=[run,tool,{...tool,status:'succeeded'},{...run,status:'succeeded'}];
 assert.deepEqual(executionSummary(completed),{label:'执行任务：已完成',status:'succeeded',count:2});
 for(const status of ['failed','paused','partial','needs_confirmation','validation_failed']){
  assert.equal(executionSummary([run,tool,{...run,status}]).status,status);
 }
 assert.equal(executionSummary([{...tool,name:'harness_probe'}]),null);
});
test('创作记录可收起且不抢焦点，执行日志和后续建议不再自动挤占正文',async()=>{
 const jsx=await readFile(new URL('../src/CreationWorkspace.jsx',import.meta.url),'utf8');
 assert.match(jsx,/hidden=\{!historyOpen\} inert=\{!historyOpen\}/);
 assert.match(jsx,/aria-controls="artedu-creation-history"/);
 assert.match(jsx,/historyToggle\.current\?\.focus\(\)/);
 assert.match(jsx,/localStorage\.getItem\("artedu-creation-history-open"\) === "1"/);
 assert.match(jsx,/<details className="agent-execution" data-status=\{execution.status\}>/);
 assert.doesNotMatch(jsx,/<details className="agent-execution"[^>]*\bopen=/);
 assert.match(jsx,/<details className="creation-canvas__followups"/);
 assert.ok(jsx.includes('key={`${activeId}-${index}-${message.role}`}'), '会话切换后折叠状态不串到另一条消息，流式更新仍保持同一节点');
 const css=await readFile(new URL('../src/morph/platform-unified.css',import.meta.url),'utf8');
 assert.match(css,/creation-canvas__history\[hidden\]\{display:none\}/);
 assert.match(css,/creation-canvas__composer textarea\{height:48px;min-height:48px;max-height:min\(18dvh,160px\)/);
 assert.match(css,/creation-canvas__thread\{min-height:0;max-height:none;flex:1/);
});
