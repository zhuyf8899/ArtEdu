import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { caseUploadError, emptyStory, splitCaseLabels } from '../src/caseStory.js';
test('案例标签与权限默认值', () => {
  assert.deepEqual(splitCaseLabels('即梦，ChatGPT, 即梦'), ['即梦','ChatGPT']);
  assert.equal(emptyStory().allowDocumentDownload,false);
  assert.equal(emptyStory().authorization,'pending');
});
test('上传文件数量、大小和类型在前端提前校验', () => {
  const image = {name:'case.png',type:'image/png',size:100};
  assert.equal(caseUploadError([image]),'');
  assert.match(caseUploadError([image],10),/10 个/);
  assert.match(caseUploadError([{...image,size:11*1024*1024}]),/10 MiB/);
  assert.match(caseUploadError([{...image,name:'source.zip',type:'application/zip'}]),/不支持/);
});
test('保存草稿不提交审核；案例提示词按文本渲染', async () => {
  const editor = await readFile(new URL('../src/CaseStoryEditor.jsx',import.meta.url),'utf8');
  const view = await readFile(new URL('../src/CaseStoryView.jsx',import.meta.url),'utf8');
  assert.ok(!editor.includes('submitWork('));
  assert.ok(editor.includes('createPortal(')); // Fixed dialogs must escape transformed route containers.
  assert.ok(editor.includes('document.body'));
  assert.ok(!view.includes('dangerouslySetInnerHTML'));
  assert.ok(view.includes('<pre>{step.prompt}</pre>'));
  assert.ok(view.includes('<video controls'), '附件整理后仍保留视频预览');
});

test('视频附件的名称、预览和下载独立成行，保留下载权限', async () => {
  const view = await readFile(new URL('../src/CaseStoryView.jsx',import.meta.url),'utf8');
  const css = await readFile(new URL('../src/case-story.css',import.meta.url),'utf8');
  assert.match(view, /className="case-attachment__header"/);
  assert.match(view, /<video controls preload="metadata" className="case-attachment__video"/);
  assert.match(view, /className="case-attachment__actions">\{asset.canDownload \?/);
  assert.match(css, /\.case-related-assets article \{[^}]*grid-template-columns: minmax\(0,1fr\);/);
  assert.match(css, /\.case-attachment__header strong \{[^}]*min-width: 0;[^}]*overflow-wrap: anywhere;/);
  assert.match(css, /\.case-attachment__video \{[^}]*max-width: 100%;/);
});
