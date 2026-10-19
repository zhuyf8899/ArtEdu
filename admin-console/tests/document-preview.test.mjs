import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';
import { previewKind, validateOfficeArchive, readPreviewBlob, MAX_PREVIEW_BYTES } from '../src/documentPreview.js';

test('预览识别 DOCX/PPTX/PDF/媒体/文本，旧版格式给出明确边界', () => {
  for (const ext of ['docx','pptx','pdf']) assert.equal(previewKind(`assets/中文.${ext}`),ext);
  for (const ext of ['doc','ppt','xls','xlsm']) assert.equal(previewKind(`旧文档.${ext}`),'unsupported');
  assert.equal(previewKind('photo','image/png'),'image'); assert.equal(previewKind('clip','video/mp4'),'video');
  assert.equal(previewKind('notes.txt'),'text'); assert.equal(previewKind('x.exe'),'unsupported');
});
test('Office 解压前检查目录、加密、单文件大小与总大小',async () => {
  const zip = new JSZip(); zip.file('word/document.xml','<document>真实文档</document>');
  const buffer = await zip.generateAsync({type:'arraybuffer'}); validateOfficeArchive(buffer);
  assert.throws(()=>validateOfficeArchive(new ArrayBuffer(10)),/损坏/);
  const bomb = buffer.slice(0), data = new DataView(bomb);
  let central = 0; while(data.getUint32(central,true)!==0x02014b50)central++;
  data.setUint32(central+24,MAX_PREVIEW_BYTES+1,true); assert.throws(()=>validateOfficeArchive(bomb),/过大/);
  data.setUint32(central+24,10,true);data.setUint16(central+8,1,true);assert.throws(()=>validateOfficeArchive(bomb),/加密/);
});
test('私有文件只走站内原鉴权接口，拒绝外链和重定向，不把文件交给第三方',async () => {
  const previousLocation=globalThis.location, previousFetch=globalThis.fetch;
  globalThis.location={origin:'http://localhost:4173'};
  let called;
  globalThis.fetch=async (url,options)=>{called={url,options};return new Response('sample',{headers:{'content-type':'text/plain'}});};
  try {
    assert.equal(await (await readPreviewBlob('/api/private-file')).text(),'sample');
    assert.equal(called.options.credentials,'include');assert.equal(called.options.redirect,'error');
    await assert.rejects(readPreviewBlob('https://example.com/a.pptx'),/仅支持/);
    globalThis.fetch=async ()=>new Response('',{status:403});await assert.rejects(readPreviewBlob('/api/private'),/权限/);
    globalThis.fetch=async ()=>new Response('',{headers:{'content-length':String(MAX_PREVIEW_BYTES+1)}});await assert.rejects(readPreviewBlob('/api/private'),/32 MB/);
  } finally {globalThis.location=previousLocation;globalThis.fetch=previousFetch;}
});
test('生成成果及课程统一进入本机预览，Office 沙箱禁脚本与外部资源，保留销毁与错误恢复',async()=>{
  const source=file=>readFile(new URL('../src/'+file,import.meta.url),'utf8');
  const viewer=await source('DocumentPreview.jsx');
  for(const text of ['docx-preview','@aiden0z/pptx-renderer',"externalMedia: 'block'",'renderAltChunks: false','sandbox="allow-same-origin"',"script-src 'none'","connect-src 'none'",'instance?.destroy()','重新尝试','跳转到幻灯片'])assert.ok(viewer.includes(text),text);
  assert.doesNotMatch(viewer,/officeapps\.live|docs\.google|allow-scripts/);
  assert.match(await source('LocalArtifact.jsx'),/<DocumentPreviewDialog/);
  assert.match(await source('LearningLibrary.jsx'),/<DocumentPreviewDialog/);
  assert.match(await source('CaseStoryView.jsx'),/asset\.canDownload && asset\.url\?\.startsWith\('\/api\/'\)/);
  assert.match(await source('ReviewDialog.jsx'),/document-preview-dialog\[open\]/);
});
test('后台回收站有明确原因、确认、状态冲突反馈和权限分离，不能直接永久删除',async()=>{
  const source=file=>readFile(new URL('../src/'+file,import.meta.url),'utf8');
  const tools=await source('AdminContentTools.jsx');
  for(const text of ['expectedStatus: item.status','reason.trim().length < 2','!ack','移入回收站','恢复至草稿','关闭并刷新列表','getManagedCases','revision.current'])assert.ok(tools.includes(text),text);
  assert.match(await source('AdminCourses.jsx'),/canReviewCourses \? getCourseReviews\(\) : Promise.resolve/);
  assert.match(await source('AdminDashboard.jsx'),/canManageContent=\{canManageQuota \|\| operatorOnly\}/);
});
test('讨论区使用可读字号、多行输入、字数提示、防重复提交与排序',async()=>{
  const jsx=await readFile(new URL('../src/CommunityLibrary.jsx',import.meta.url),'utf8');
  for(const text of ['讨论排序','case-comment-help','rows={3}','disabled={!comment.trim() || interactionBusy}','item.createdAt || item.created_at'])assert.ok(jsx.includes(text),text);
  const css=await readFile(new URL('../src/morph/platform-unified.css',import.meta.url),'utf8');
  assert.match(css,/comment-section article p\{font-size:16px;line-height:1.85/);
  assert.match(css,/comment-section article strong\{font-size:14px/);
  assert.match(css,/comment-content\{display:block;flex:1;min-width:0\}/);
});
