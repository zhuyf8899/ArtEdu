import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { caseUploadError, emptyStory, splitCaseLabels, safeCaseSourceUrl } from '../src/caseStory.js';
import { findCaseEditorialIssues } from '../src/caseEditorial.js';
import { correctCaseCopy } from '../../scripts/case-copy-corrections.mjs';
test('案例标签与权限默认值', () => {
  assert.deepEqual(splitCaseLabels('即梦，ChatGPT, 即梦'), ['即梦','ChatGPT']);
  assert.equal(emptyStory().allowDocumentDownload,false);
  assert.equal(emptyStory().authorization,'pending');
  assert.equal(emptyStory().displayStyle, 'case-study');
  assert.equal(emptyStory().originalUrl, '');
});

test('外部作品链接仅接受无凭据 HTTP(S)，历史恶意地址不渲染为链接', () => {
  assert.equal(safeCaseSourceUrl('https://thecvf-art.com/project.php?year=2025&id=1043'), 'https://thecvf-art.com/project.php?year=2025&id=1043');
  for (const value of ['', null, 'javascript:alert(1)', 'data:text/html,hello', 'file:///private', '/relative', 'https://user:secret@example.com/', 'https://exa\nmple.com/', 'https://' ]) assert.equal(safeCaseSourceUrl(value), '');
});

test('资料编辑说明提前提示，作者反思与技术创作叙述不误伤', async () => {
  assert.equal(findCaseEditorialIssues({summary:'资料整理说明：视频待作者补充'}).length, 1);
  assert.deepEqual(findCaseEditorialIssues({summary:'我们以404网页错误为创作主题。视频资源返回404后，我们调整了链接。',story:{reflection:'我们发现AI是放大器，而非替代者。',steps:[{title:'实验',prompt:'本次上传，请整理资料生成作品'}]}}), []);
  const frontend = await readFile(new URL('../src/caseEditorial.js',import.meta.url),'utf8');
  const backend = await readFile(new URL('../../apps/api/src/modules/studio/case-editorial.ts',import.meta.url),'utf8');
  const rules = text => text.match(/const editorialPatterns = \[[\s\S]*?\n\];/)[0];
  assert.equal(rules(frontend), rules(backend), '前后端使用完全相同的检测规则');
});

test('已审查文案修订保留作者反思，重复执行不产生变化', () => {
  const source = {title:'作品',summary:'设计作品简介',story:{reflection:'我们用AI探索形态。\n\n资料整理说明：原文未提供参数，相关字段留空。',creators:['作者'],steps:[{title:'创作',prompt:'本次上传请生成图案'}]}};
  const fixed = correctCaseCopy(source);
  assert.equal(fixed.story.reflection,'我们用AI探索形态。');
  assert.equal(fixed.moved.length,1);
  assert.equal(source.story.reflection.includes('资料整理说明'),true);
  assert.equal(correctCaseCopy({...source,summary:fixed.summary,story:fixed.story}).changed,false);
  const demo = {title:'作品',summary:'从传统纹样提取结构',story:{}};
  assert.equal(correctCaseCopy(demo).changed,false);
});

test('备注只在编辑和审核中展示，公共详情不渲染私有备注', async () => {
  const view = await readFile(new URL('../src/CaseStoryView.jsx',import.meta.url),'utf8');
  const editor = await readFile(new URL('../src/CaseStoryEditor.jsx',import.meta.url),'utf8');
  const reviewer = await readFile(new URL('../src/CaseReviewContent.jsx',import.meta.url),'utf8');
  assert.doesNotMatch(view,/story\.editorialNote/);
  assert.match(editor,/findCaseEditorialIssues/);
  assert.match(editor,/编辑备注（仅上传者与审核人员可见）/);
  assert.match(reviewer,/不对读者公开/);
});

test('展览详情保留媒体和原作者，来源在作品下方；原有教学案例布局不受影响', async () => {
  const view = await readFile(new URL('../src/CaseStoryView.jsx', import.meta.url), 'utf8');
  const editor = await readFile(new URL('../src/CaseStoryEditor.jsx', import.meta.url), 'utf8');
  const library = await readFile(new URL('../src/CommunityLibrary.jsx', import.meta.url), 'utf8');
  const css = await readFile(new URL('../src/case-story.css', import.meta.url), 'utf8');
  assert.ok(view.indexOf('<CaseSourceFooter story={story} />') > view.indexOf('case-related-assets'));
  assert.match(view, /来源网站/); assert.match(view, /展览信息/); assert.match(view, /查看原作/);
  assert.match(view, /rel="noopener noreferrer"/);
  assert.match(view, /safeCaseSourceUrl\(story.originalUrl\)/);
  assert.match(view, /asset.url !== work.previewUrl/);
  assert.match(editor, /作品展示方式/);
  assert.match(library, /selected.story\?\.origin === "collected" && selected.story\?\.displayStyle === "exhibition"/);
  assert.match(css, /\.community-detail--exhibition \{ width: min\(836px, 100%\)/);
  assert.match(css, /\.case-source-footer__original \{ width: 100%; box-sizing: border-box;/);
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

test('已驳回案例在作者详情展示整改意见和审核历史', async () => {
  const library = await readFile(new URL('../src/CommunityLibrary.jsx',import.meta.url),'utf8');
  const css = await readFile(new URL('../src/case-story.css',import.meta.url),'utf8');
  assert.match(library, /selected\.latestRejection\?\.reason/);
  assert.match(library, /查看审核历史/);
  assert.match(library, /修改并保存后，可再次提交审核/);
  assert.match(css, /\.case-review-feedback/);
  assert.match(css, /\.case-review-history/);
});

test('案例社区页头仅保留新建草稿主操作，并沿用 AI 讲堂紧凑布局', async () => {
  const library = await readFile(new URL('../src/CommunityLibrary.jsx',import.meta.url),'utf8');
  const portal = await readFile(new URL('../src/Portal.jsx',import.meta.url),'utf8');
  const css = await readFile(new URL('../src/styles.css',import.meta.url),'utf8');
  assert.match(library, /className="learning-library-intro community-page-intro"/);
  assert.match(library, /<h1 id="community-page-title">案例社区<\/h1>/);
  assert.match(library, /className="community-create-draft"[^>]*>.*新建案例草稿/);
  assert.doesNotMatch(library, /分享创作，也分享过程|我的案例与草稿/);
  assert.match(portal, /section !== "community"/);
  assert.match(css, /\.community-page-intro \{ grid-template-columns: minmax\(0, 1fr\) auto; \}/);
});
