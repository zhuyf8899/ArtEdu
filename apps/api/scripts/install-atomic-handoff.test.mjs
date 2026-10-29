import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {validateAtomicHandoff,installAtomicHandoff} from './install-atomic-handoff.mjs';
const bundle=JSON.parse(await readFile(new URL('../../../seed/atomic-handoff/manifest.json',import.meta.url),'utf8'));
test('17个交接目录与课内节点去重复用，原稿示例进度和教师账号不导入',()=>{
 assert.equal(validateAtomicHandoff(bundle).nodes.filter(n=>n.kind==='teaching').length,30);
 const course=bundle.nodes.find(n=>n.kind==='course');assert.equal(course.payload.steps.length,17);
 const vibe=bundle.nodes.find(n=>n.payload.title==='Vibe Coding');assert.ok(course.payload.steps.some(s=>s.atomId===vibe.id));
 assert.ok(bundle.nodes.every(n=>!('progress' in n)&&!('roles' in n)));
 assert.equal(bundle.publisher.status,'disabled');
 const malicious=structuredClone(bundle);malicious.nodes[0].progress=100;assert.throws(()=>validateAtomicHandoff(malicious));
});
test('拒绝越界附件与失联课程引用',()=>{
 const a=structuredClone(bundle);a.media.push({storageKey:'../escape.png'});assert.throws(()=>validateAtomicHandoff(a));
 const b=structuredClone(bundle);b.nodes.find(n=>n.kind==='course').payload.steps[0].atomId='not-imported';assert.throws(()=>validateAtomicHandoff(b));
});
test('所有原稿封面均是本地文件并匹配校验值',async()=>{
 for(const a of bundle.coverAssets){const bytes=await readFile(new URL('../../../admin-console/public/morph-course-network/handoff/'+a.filename,import.meta.url));assert.equal(createHash('sha256').update(bytes).digest('hex'),a.sha256);}
});
test('重复安装不写任何内容或学习记录，校验不一致停止而不覆盖',async()=>{
 const calls=[],client={query:async(sql)=>{calls.push(sql);return {rows:sql.startsWith('SELECT checksum')?[{checksum:'same',rolled_back_at:null}]:[]};}};
 assert.equal((await installAtomicHandoff(client,bundle,'same',{apply:true})).alreadyInstalled,true);
 assert.ok(calls.every(sql=>!/^INSERT|^UPDATE|^DELETE/.test(sql)));
 await assert.rejects(installAtomicHandoff(client,bundle,'changed',{apply:true}),/never overwrite/);
 assert.equal(calls.at(-1),'ROLLBACK');
});
