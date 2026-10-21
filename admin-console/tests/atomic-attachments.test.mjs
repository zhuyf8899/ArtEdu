import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { selectAtomicAttachments,saveAtomicAttachments } from '../src/atomicAttachments.js';
const file=(name,size=10)=>({name,size,lastModified:1});
test('首次创建即可多选附件，去重、限制数量、拒绝空文件与非视频超限',()=>{
 const first=selectAtomicAttachments([],[file('讲义.pdf'),file('练习.pptx'),file('讲义.pdf'),file('病毒.exe'),file('空.txt',0),file('大.docx',11*1024*1024)]);
 assert.equal(first.entries.length,2);assert.equal(first.errors.length,3);
 assert.equal(selectAtomicAttachments([],Array.from({length:15},(_,i)=>file(i+'.pdf')),2).entries.length,10);
 assert.equal(selectAtomicAttachments([],[file('视频.mp4',20*1024*1024)]).entries.length,1);
});
test('先保存原子再上传附件，使用真实返回的 ID/版本，保留既有附件',async()=>{
 const order=[],checkpoint={id:'old',revision:1,assetIds:['existing'],saved:false};
 const entries=selectAtomicAttachments([],[file('讲义.pdf'),file('练习.pptx')]).entries;
 const updates=[];
 const result=await saveAtomicAttachments({payload:{title:'原子',assetIds:['existing']},entries,checkpoint,persist:async(payload,target)=>{assert.deepEqual(payload.assetIds,['existing']);assert.equal(target.id,'old');order.push('persist');return {id:'old',revision:2};},upload:async(id,revision,file,options)=>{assert.equal(id,'old');assert.equal(revision,2);options.onProgress(50);order.push(file.name);return {id:file.name};},onUpdate:(key,patch)=>updates.push(patch)});
 assert.deepEqual(order,['persist','讲义.pdf','练习.pptx']);assert.deepEqual(result,{id:'old',revision:2});assert.deepEqual(checkpoint.assetIds,['existing','讲义.pdf','练习.pptx']);assert.ok(updates.some(p=>p.progress===50));
});
test('部分失败保留草稿与成功附件，重试不新建原子、不重复成功上传',async()=>{
 const checkpoint={assetIds:[],saved:false};let saves=0,fail=true;
 const entries=selectAtomicAttachments([],[file('一.pdf'),file('二.pdf')]).entries,calls=[];
 const options={payload:{title:'原子'},entries,checkpoint,persist:async()=>{saves++;return {id:'new',revision:1};},upload:async(id,revision,f)=>{calls.push(f.name);if(f.name==='二.pdf'&&fail)throw Error('网络中断');return {id:f.name};},onUpdate:(key,patch)=>Object.assign(entries.find(e=>e.key===key),patch)};
 await assert.rejects(saveAtomicAttachments(options),/草稿已保存/);assert.equal(entries[0].status,'complete');assert.equal(entries[1].status,'failed');assert.equal(checkpoint.id,'new');
 fail=false;await saveAtomicAttachments(options);assert.equal(saves,1);assert.deepEqual(calls,['一.pdf','二.pdf','二.pdf']);
 // If metadata is changed after a failed batch, a new draft includes all saved assets.
 options.payload={title:'修改后的原子'};options.persist=async(payload,target)=>{assert.deepEqual(payload.assetIds,['一.pdf','二.pdf']);assert.equal(target.revision,1);return {id:'new',revision:2};};
 await saveAtomicAttachments(options);assert.equal(checkpoint.revision,2);assert.equal(calls.length,3);
});
test('草稿保存失败不上传任何文件，编辑表单内有附件入口和失败保护',async()=>{
 await assert.rejects(saveAtomicAttachments({payload:{title:'原子'},entries:[{file:file('a.pdf')}],checkpoint:{saved:false},persist:async()=>{throw Error('保存失败');},upload:async()=>{assert.fail('must not upload');}}),/保存失败/);
 const src=await readFile(new URL('../src/AtomicLearningHub.jsx',import.meta.url),'utf8');
 for(const text of ['教学附件','选择原子教学附件','multiple accept={atomicAttachmentAccept}','保存草稿并上传附件','saveAtomicAttachments','onBusy(false)','disabled={busy}','正在保存草稿或上传附件'])assert.ok(src.includes(text),text);
});
