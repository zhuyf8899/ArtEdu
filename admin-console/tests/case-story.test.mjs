import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { caseUploadError, emptyStory, splitCaseLabels, safeCaseSourceUrl } from '../src/caseStory.js';
import { findCaseEditorialIssues } from '../src/caseEditorial.js';
import { correctCaseCopy } from '../../scripts/case-copy-corrections.mjs';
import { splitCommunityCollections } from '../src/communityCollections.js';
test('案例标签与权限默认值', () => {
  assert.deepEqual(splitCaseLabels('即梦，ChatGPT, 即梦'), ['即梦','ChatGPT']);
  assert.equal(emptyStory().allowDocumentDownload,false);
  assert.equal(emptyStory().authorization,'pending');
  assert.equal(emptyStory().displayStyle, 'case-study');
  assert.equal(emptyStory().originalUrl, '');
});

test('案例图片复用 body Portal 适屏查看器，图集缩略图不撑成长页面', async () => {
  const library = await readFile(new URL('../src/CommunityLibrary.jsx',import.meta.url),'utf8');
  const lightbox = await readFile(new URL('../src/ImageLightbox.jsx',import.meta.url),'utf8');
  const css = await readFile(new URL('../src/case-story.css',import.meta.url),'utf8');
  assert.match(library, /<ImageLightbox[^>]*variant="gallery"/);
  assert.match(library, /gallery=\{\{ index, count: images.length/);
  assert.match(lightbox, /createPortal\(/);
  assert.match(lightbox, /document.body\)/);
  assert.match(lightbox, /previousFocus.focus\?\.\(\{ preventScroll: true \}\)/);
  assert.match(lightbox, /event.key === "Tab"/);
  assert.match(lightbox, /event.key === "ArrowRight"/);
  assert.match(lightbox, /\[src, reset\]/);
  assert.match(css, /\.case-gallery \.case-image-button \{[^}]*aspect-ratio: 4 \/ 3/);
  const sharedCss = await readFile(new URL('../src/styles.css',import.meta.url),'utf8');
  assert.match(sharedCss, /\.image-lightbox \{[^}]*height: 100dvh;[^}]*grid-template-rows: minmax\(0,1fr\)/);
  assert.doesNotMatch(css, /\.case-story--exhibition \.case-gallery img \{ max-height: none/);
});

test('案例分为精选和社区，旧案例、外部来源及热门标记不会自动变成精选', async () => {
  const works = [{id:'legacy',isFeatured:true},{id:'external',origin:'collected'},{id:'cvpr',collection:'art-selection'},{id:'posted',collection:'community'}];
  const sections = splitCommunityCollections(works);
  assert.deepEqual(sections['art-selection'].map(w=>w.id),['cvpr']);
  assert.deepEqual(sections.community.map(w=>w.id),['legacy','external','posted']);
  assert.equal(sections['art-selection'].length+sections.community.length,works.length);
  const library = await readFile(new URL('../src/CommunityLibrary.jsx',import.meta.url),'utf8');
  assert.match(library,/id="featured-art-cases" title="精选艺术案例"/);
  assert.match(library,/id="community-cases" title="社区案例"/);
  assert.match(library,/selected.status === "approved"/);
  assert.match(library,/setWorkCollection\(selected.id, collection\)/);
  const editor = await readFile(new URL('../src/CaseStoryEditor.jsx',import.meta.url),'utf8');
  assert.match(editor,/const \{ collection, \.\.\.writableStory \} = form.story/);
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

test('视频只显示播放器和下载权限，文件名仅留在文档附件中', async () => {
  const view = await readFile(new URL('../src/CaseStoryView.jsx',import.meta.url),'utf8');
  const css = await readFile(new URL('../src/case-story.css',import.meta.url),'utf8');
  assert.match(view, /className="case-attachment__header"/);
  assert.match(view, /asset.asset_type !== "video" && <header/);
  assert.doesNotMatch(view, /<figcaption/);
  assert.doesNotMatch(view, /aria-label=\{asset.file_name\}/);
  assert.match(view, /<video controls preload="metadata" className="case-attachment__video"/);
  assert.match(view, /className="case-attachment__actions">[^\n]*asset.canDownload \?/);
  assert.match(view, /asset.canDownload && asset.url\?\.startsWith\('\/api\/'\)/, '在线预览与下载使用同样的授权边界');
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

test('案例封面不会被 Grid 固有尺寸撑开，MORPH 详情与视频不铺满大屏', async () => {
  const css = await readFile(new URL('../src/case-story.css',import.meta.url),'utf8');
  const morph = await readFile(new URL('../src/morph/platform-unified.css',import.meta.url),'utf8');
  assert.match(css, /\.community-detail \.community-detail__hero \{[^}]*grid-template-rows: minmax\(0,1fr\)/);
  assert.match(css, /\.community-detail__hero \.case-image-button--hero \{[^}]*min-height: 0;[^}]*overflow: hidden/);
  assert.match(css, /\.community-detail__hero \.case-image-button--hero img \{[^}]*height: 100%;[^}]*max-height: 100%;[^}]*object-fit: contain/);
  assert.match(css, /\.case-related-assets \.case-attachment--video \{[^}]*width: min\(100%,800px\);[^}]*box-sizing: border-box;[^}]*justify-self: center/);
  assert.match(css, /\.case-attachment__video \{[^}]*width: auto; height: auto;[^}]*max-width: 100%;[^}]*max-height: min\(56dvh,480px\)/);
  assert.match(morph, /body\.morph-platform \.morph-v17 \.community-detail\{[^}]*max-width:1120px/);
  assert.match(morph, /body\.morph-platform \.morph-v17 \.community-detail--exhibition\{max-width:1040px/);
});

test('真实案例组件区分视频和文档，保留播放及下载权限且不显示媒体文件名', async () => {
  const [{createServer},React,{renderToStaticMarkup}] = await Promise.all([import('vite'),import('react'),import('react-dom/server')]);
  const server = await createServer({server:{middlewareMode:true,hmr:false},appType:'custom'});
  try {
    const {CaseStoryView} = await server.ssrLoadModule('/src/CaseStoryView.jsx');
    for (const exhibition of [false,true]) {
      const work = {title:'测试作品',status:'approved',previewUrl:'/cover.jpg',story:{},assets:[
        {id:'video',asset_type:'video',url:'/film.mp4',file_name:'private-video-name.mp4',canDownload:true},
        {id:'locked',asset_type:'video',url:'/locked.mp4',file_name:'locked-video-name.mp4',canDownload:false},
        {id:'doc',asset_type:'document',url:'/guide.pdf',file_name:'创作手册.pdf',canDownload:false},
        {id:'image',asset_type:'image',url:'/image.jpg',file_name:'private-image-name.jpg'},
      ]};
      const html = renderToStaticMarkup(React.createElement(CaseStoryView,{work,exhibition}));
      assert.match(html,/class="case-related-assets case-related-assets--multiple-videos"/);
      assert.equal((html.match(/class="case-attachment case-attachment--video"/g)??[]).length,2);
      assert.equal((html.match(/<video controls=""/g)??[]).length,2);
      assert.match(html,/href="\/film.mp4" download=""/);
      assert.doesNotMatch(html,/<a[^>]*href="\/locked.mp4"/);
      assert.ok(html.includes('作者未开放下载'));
      assert.ok(html.includes('创作手册.pdf'));
      assert.ok(html.indexOf('作品影像') < html.indexOf('class="case-gallery"'), '视频先于图集展示');
      assert.ok(html.indexOf('附件资料') > html.indexOf('class="case-gallery"'), '文档不混入视频区');
      assert.equal((html.match(/src="\/film.mp4"/g)??[]).length,1,'视频不重复渲染');
      assert.doesNotMatch(html,/private-video-name|locked-video-name|private-image-name/);
      assert.equal(html.includes('poster="/cover.jpg"'),exhibition);
      const single = renderToStaticMarkup(React.createElement(CaseStoryView,{work:{...work,assets:work.assets.slice(0,1)},exhibition}));
      assert.doesNotMatch(single,/case-related-assets--multiple-videos/);
      assert.doesNotMatch(single,/附件资料/,'没有文档时不展示空附件区');
      const noVideo = renderToStaticMarkup(React.createElement(CaseStoryView,{work:{...work,assets:work.assets.slice(2)},exhibition}));
      assert.doesNotMatch(noVideo,/作品影像|<video/,'纯图片案例不留下空影像区');
    }
  } finally { await server.close(); }
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
