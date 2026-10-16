import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { dailyQuotaLabel, morphCourseCover, morphQueryMatches, morphModuleLabel, toolPresentation, morphCourseLevel } from '../src/morph/morphPresentation.js';
import { toolCardMetadata } from '../src/morph/toolCardMetadata.js';

test('tool cards use catalog tags, neutral source subtitles and semantic category colors',()=>{
  const meta=toolCardMetadata({id:'morph-tool-blender',category:'3D 与动态',catalog:{bundleId:'morph-catalog-v1',subtitle:'开源三维创作平台',tags:['3D','Rendering','3D','  ',' Animation ',null],linkReview:{result:'not_confirmed'}}});
  assert.deepEqual(meta,{subtitle:'开源三维创作平台',tone:'three',tags:['3D','Rendering','Animation'],unconfirmed:true});
  assert.equal(toolCardMetadata({category:'AI 创作与生成'}).tone,'ai');
  assert.equal(toolCardMetadata({category:'实时与交互'}).tone,'live');
  assert.equal(toolCardMetadata({category:'灵感与资源'}).tone,'resource');
  assert.deepEqual(toolCardMetadata({}),{subtitle:'',tone:'default',tags:[],unconfirmed:false});
  assert.equal(toolCardMetadata({id:'morph-tool-blender'}).subtitle,'');
  assert.equal(toolCardMetadata({catalog:{subtitle:'管理员提供的说明'}}).subtitle,'管理员提供的说明');
});

test('compact tool logo cannot stretch into a hero and related courses stay collapsed',async()=>{
  const card=await readFile(new URL('../src/morph/MorphToolCard.jsx',import.meta.url),'utf8');
  const css=await readFile(new URL('../src/morph/tool-cards.css',import.meta.url),'utf8');
  assert.doesNotMatch(card,/morph-tool-card__preview|showAllCourses/);
  assert.match(card,/useState\(false\)/);assert.match(card,/hidden=\{!showCourses\}/);
  assert.match(card,/aria-controls=\{coursesId\}/);assert.match(card,/related\.map/);
  assert.match(card,/onError=\{\(\) => setLogoFailed\(true\)\}/);
  assert.match(css,/morph-tool-card__icon>img\{[^}]*width:36px;[^}]*height:36px;[^}]*object-fit:contain/);
  assert.match(css,/morph-tool-card__courses\[hidden\]\{display:none\}/);
  assert.match(css,/morph-tool-card__title>p\{[^}]*min-height:0/);
  assert.match(css,/tool-directory__list--grid\{align-items:stretch\}/);
  assert.match(css,/workflow-card>button\{[^}]*background:#171a2f;color:#fff/);
  assert.match(css,/justify-content:space-between;align-items:center;padding-top:14px/);
});

test('tool actions remain separate from course disclosures and preserve safe launch semantics',async()=>{
  const card=await readFile(new URL('../src/morph/MorphToolCard.jsx',import.meta.url),'utf8');
  assert.match(card,/aria-labelledby=\{titleId\}/);
  assert.match(card,/href=\{tool.href\}/);assert.match(card,/target=\{info.newTab/);
  assert.match(card,/noopener noreferrer/);assert.match(card,/referrerPolicy="no-referrer"/);
  assert.match(card,/onNavigate\(`\/learning\?course=\$\{encodeURIComponent\(id\)\}`\)/);
  assert.match(card,/info.workflow \? <button[^>]*onClick=\{onOpenWorkflowBuilder\}/);
  assert.match(card,/canManage && <button/);
  assert.doesNotMatch(card,/localStorage|MORPH_DATA|免费增值|LAB PICK/);
});
test('search module labels follow MORPH navigation without changing classic taxonomy or IDs',()=>{
  assert.equal(morphModuleLabel('AI 讲堂','morph'),'原子课程');
  assert.equal(morphModuleLabel('设计工具','morph'),'技能工具');
  assert.equal(morphModuleLabel('案例社区','morph'),'案例社区');
  assert.equal(morphModuleLabel('AI 讲堂','classic'),'AI 讲堂');
});
test('MORPH quota distinguishes unconfigured limits from exhausted quotas',()=>{
  assert.equal(dailyQuotaLabel(), '未设日上限');
  assert.equal(dailyQuotaLabel({dailyLimit:null,dailyUsed:4}), '未设日上限');
  assert.equal(dailyQuotaLabel({dailyLimit:10,dailyUsed:3}), '7 次 / 今日');
  assert.equal(dailyQuotaLabel({dailyLimit:0,dailyUsed:0}), '0 次 / 今日');
  assert.equal(dailyQuotaLabel({dailyLimit:2,dailyUsed:5}), '0 次 / 今日');
});
test('course artwork prefers uploaded API resources without title cropping or fabricated progress',()=>{
  assert.equal(morphCourseCover({id:'course-vibe-gallery'}), '/assets/learning/vibe-coding.jpg');
  assert.equal(morphCourseCover({id:'course-vibe-gallery',coverImageUrl:'/api/courses/a/cover'}), '/api/courses/a/cover');
  assert.equal(morphCourseCover({id:'unknown',coverUrl:'/custom.png'}), '/custom.png');
  assert.equal(morphCourseCover({id:'unknown'}), '');
});
test('catalog query is whitespace insensitive, case insensitive, AND across terms',()=>{
  assert.equal(morphQueryMatches(['AI 设计',null,'Figma'],'  ai   FIGMA '),true);
  assert.equal(morphQueryMatches(['AI 设计','Figma'],'ai Blender'),false);
  assert.equal(morphQueryMatches([],''),true);
});
test('all imported CSS rules stay namespaced including body tokens and media rules',async()=>{
  const dir=new URL('../src/morph/',import.meta.url);
  const {createRequire}=await import('node:module');
  const postcss=createRequire(new URL('../package.json',import.meta.url))('postcss');
  for(const file of (await readdir(dir)).filter(n=>n.startsWith('source-')&&n.endsWith('.css'))){
    const root=postcss.parse(await readFile(new URL(file,dir),'utf8'));
    root.walkRules(rule=>{if(rule.parent.type==='atrule'&&/keyframes$/.test(rule.parent.name))return;for(const selector of rule.selectors)assert.ok(selector.startsWith('.morph-v17'),`${file}: ${selector}`);});
  }
});
test('integration keeps real business services, legacy rollback, and excludes demo storage',async()=>{
  const portal=await readFile(new URL('../src/Portal.jsx',import.meta.url),'utf8');
  assert.match(portal,/VITE_PORTAL_UI/); assert.match(portal,/getCourses\(\), getWorks\(\)/);
  assert.match(portal,/<LearningLibrary variant=/);assert.match(portal,/<CommunityLibrary variant=/);
  const dir=new URL('../src/morph/',import.meta.url);
  for(const file of (await readdir(dir)).filter(n=>/\.(jsx|js)$/.test(n))){
    const source=await readFile(new URL(file,dir),'utf8');
    assert.doesNotMatch(source,/MORPH_DATA|morph-my-works|morph-progress|morph-creation-records|王婧/);
  }
});
test('every imported animation exposes teardown rather than page-global ownership',async()=>{
  const dir=new URL('../src/morph/',import.meta.url);
  for(const file of ['cosmosEffect.js','atomicEffect.js','networkEffect.js','floatingEffect.js']){
    const source=await readFile(new URL(file,dir),'utf8');
    assert.match(source,/export function mount/);assert.match(source,/disconnect\(/);
    assert.doesNotMatch(source,/window\.destroy|location\.reload\(/);
  }
});
test('tool catalog has visible empty/error recovery and uses SPA navigation for same-tab links',async()=>{
  const source=await readFile(new URL('../src/WorkflowStudio.jsx',import.meta.url),'utf8');
  assert.match(source,/没有匹配的工具/);assert.match(source,/清除工具筛选/);
  assert.match(source,/重新加载工具/);assert.match(source,/onNavigate\(tool.href\)/);
});
test('MORPH standalone chat deducts navigation height so its send control remains visible',async()=>{
  const css=await readFile(new URL('../src/morph/integration.css',import.meta.url),'utf8');
  assert.match(css,/\.portal-shell\.morph-v17\.portal-shell--standalone \.creation-canvas\{height:calc\(100dvh - 56px\)/);
});

test('tool cards distinguish destination from window-opening mode without invented pricing',()=>{
  const internal=toolPresentation({name:'创作助手',href:'/create',launchMode:'same_tab',detail:'真实说明'});
  assert.equal(internal.internal,true);assert.equal(internal.newTab,false);assert.equal(internal.host,'MORPH LAB');assert.equal(internal.detail,'真实说明');
  const external=toolPresentation({name:'Figma',href:'https://www.figma.com/',launchMode:'same_tab'});
  assert.equal(external.internal,false);assert.equal(external.newTab,false);assert.equal(external.host,'figma.com');assert.equal(external.kind,'外部网站');
  assert.equal(toolPresentation({href:'/learning',launchMode:'new_tab'}).newTab,true);
  assert.equal(toolPresentation({id:'tool-directory-workflow',href:'/studio',launchMode:'new_tab'}).newTab,false);
  assert.equal(toolPresentation({href:'//outside.example'}).internal,false);
  assert.equal(toolPresentation({href:'invalid'}).host,'外部网站');
  assert.ok(!Object.keys(external).includes('price'));
});

test('three catalogs share category controls, clear actions, counts, and programmatic selected state',async()=>{
  const controls=await readFile(new URL('../src/morph/CatalogControls.jsx',import.meta.url),'utf8');
  assert.match(controls,/aria-pressed=\{value === option.value\}/);assert.match(controls,/option.count/);
  assert.match(controls,/type="search"/);assert.match(controls,/清除筛选/);assert.match(controls,/role="status"/);
  for(const file of ['morph/MorphCatalog.jsx','CommunityLibrary.jsx','WorkflowStudio.jsx']){
    const source=await readFile(new URL('../src/'+file,import.meta.url),'utf8');assert.match(source,/<CatalogControls/);
  }
  const community=await readFile(new URL('../src/CommunityLibrary.jsx',import.meta.url),'utf8');
  assert.match(community,/作品领域/);assert.match(community,/设计方法/);assert.match(community,/创作工具/);
});

test('desktop tool grid and readable shared filters have focus and reduced-motion support',async()=>{
  const css=await readFile(new URL('../src/morph/catalog-controls.css',import.meta.url),'utf8');
  assert.match(css,/@media \(max-width:1199px\)/);assert.match(css,/repeat\(2,minmax\(0,1fr\)\)!important/);
  assert.match(css,/:focus-visible/);assert.match(css,/prefers-reduced-motion:reduce/);
  assert.match(css,/height: 44px/);assert.match(css,/min-height: 38px/);
  const card=await readFile(new URL('../src/morph/MorphToolCard.jsx',import.meta.url),'utf8');
  assert.match(card,/noopener noreferrer/);assert.match(card,/`打开 \$\{info.name\}`/);assert.match(card,/onOpenWorkflowBuilder/);
  assert.doesNotMatch(card,/免费增值|收藏 WorkBuddy|浏览量|price|rating/);
});

test('final handoff course labels and preview use stable course codes, not array order',async()=>{
  assert.equal(morphCourseLevel({difficulty:'advanced',catalog:{bundleId:'morph-catalog-v1'}}),'专家');
  assert.equal(morphCourseLevel({difficulty:'advanced'}),'高级');
  const source=await readFile(new URL('../src/morph/MorphCatalog.jsx',import.meta.url),'utf8');
  assert.match(source,/code==='DTH-10'/);assert.match(source,/POS-11/);assert.match(source,/PRD-12/);assert.match(source,/INF-13/);
  assert.doesNotMatch(source,/onOpen\(courses\[0\]\.id\)/);
  assert.match(source,/查看详情/);assert.match(source,/耗时/);assert.match(source,/c\.catalog\.code/);
});
