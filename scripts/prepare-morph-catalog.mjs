import { readFile, writeFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sampleLessons } from '../seed/morph-catalog/sample-lessons.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const toolSlugs = ['workbuddy','codex','figma','cursor','lovart','midjourney','jimeng','kling','liblib','libtv','nano-banana','blender','spline','tripo','hunyuan','touchdesigner','unity','pinterest','behance'];
const details = ['用自然语言组织工作任务与协作流程。','以编程任务为入口的 AI 辅助开发工具。','设计界面、版式与交互原型。','在代码编辑环境中辅助开发与修改。','探索 AI 辅助的视觉设计方案。','通过提示词探索图像方案。','探索图像与视频创作。','探索 AI 视频创作。','浏览图像生成模型与创作流程。','探索视频创作与制作流程。','在 Gemini 产品中探索图像生成与编辑。','学习三维建模、材质、渲染与动画。','探索浏览器中的三维场景与交互。','探索文字或图片到三维模型的创作流程。','探索三维模型与纹理生成。','学习节点式实时视觉与交互。','制作实时场景与交互原型。','收集视觉参考与情绪板。','浏览项目展示与作品集参考。'];
const courseTools = [['figma','pinterest'],['figma'],['figma'],['figma','lovart'],['blender'],['figma','touchdesigner'],['figma','unity'],['figma'],['blender','touchdesigner'],['workbuddy','pinterest'],['figma','lovart'],['blender','tripo'],['figma','codex']];

export function buildCatalog(source) {
  if(source.courses?.length !== 13 || source.tools?.length !== 19) throw new Error('Expected 13 source courses and 19 source tools');
  if(source.courses.map(c=>c.code).join(',')!=='COL-01,TYP-02,GRD-03,BRD-04,CMF-05,MOT-06,HUD-07,TOK-08,PAR-09,DTH-10,POS-11,PRD-12,INF-13')throw new Error('Source course version/order changed');
  if(source.tools.map(t=>t.title).join('|')!=='WorkBuddy|Codex|Figma|Cursor|Lovart|Midjourney|即梦 Jimeng|可灵 Kling|LibLib 哩布|LibTV 哩布 TV|Nano Banana|Blender|Spline|Tripo|混元 3D|TouchDesigner|Unity|Pinterest|Behance')throw new Error('Source tool version/order changed');
  const tools = source.tools.map((t,i)=>({id:`morph-tool-${toolSlugs[i]}`,legacyId:t.id,name:t.title,category:t.type,detail:details[i],href:`https://${t.domain}/`,coverUrl:`/morph-v17/${t.images[0]}`,tags:t.tags,stage:t.stage,relatedCourseIds:[]}));
  // Keep references, not pricing claims. A fetch failure is not evidence that
  // a service is broken; make the incomplete access verification explicit.
  tools.find(t=>t.id==='morph-tool-codex').href='https://openai.com/codex/';
  for(const tool of tools)tool.linkReview={checkedAt:'2026-10-16',result:['kling','libtv','blender','pinterest','behance'].some(slug=>tool.id===`morph-tool-${slug}`)?'not_confirmed':'reference_checked'};
  const courses = source.courses.map((c,i)=>({id:`morph-course-${c.code.toLowerCase()}`,legacyId:c.id,code:c.code,title:c.title,summary:c.desc,category:c.type,
    difficulty:c.level.includes('专家')?'advanced':c.level.includes('进阶')?'intermediate':'beginner',estimatedMinutes:Number(c.duration.match(/\d+/)?.[0]),coverUrl:`/morph-v17/${c.cover}`,
    availability:sampleLessons[c.code]?'trial':'coming_soon',reviewStatus:'pending',authorLabel:'作者待确认',method:c.type==='软件实操'?'工具实践':'设计练习',
    toolIds:courseTools[i].map(slug=>`morph-tool-${slug}`),tools:courseTools[i].map(slug=>tools.find(t=>t.id===`morph-tool-${slug}`).name),
    lessons:sampleLessons[c.code]??[],
  }));
  for(const tool of tools){tool.relatedCourseIds=courses.filter(c=>c.toolIds.includes(tool.id)).map(c=>c.id);tool.relatedCourseTitles=Object.fromEntries(courses.filter(c=>c.toolIds.includes(tool.id)).map(c=>[c.id,c.title]));}
  return {id:'morph-catalog-v1',version:1,source:'MORPH LAB v17 用户提供交接包',notice:'目录依据交接稿；试学讲义为新编待教研审核内容。工具仅为第三方导航，不代表 API 接入、免费或可在所有地区使用。',
    archiveCourseIds:['course-ai-design-foundation','course-traditional-pattern','course-vibe-gallery'],
    archiveToolIds:['tool-directory-figma','tool-directory-canva','tool-directory-photopea','tool-directory-behance','tool-directory-unsplash'],courses,tools};
}

export async function prepare(sourceDirectory) {
  const raw=await readFile(path.join(sourceDirectory,'platform-data.js'),'utf8');
  // Parse the static JSON assignment only; never execute supplied scripts.
  const match=raw.match(/^\s*window\.MORPH_DATA\s*=\s*([\s\S]+);\s*$/);
  if(!match)throw new Error('Expected static MORPH_DATA JSON');
  const bundle=buildCatalog(JSON.parse(match[1]));
  bundle.assets=[];
  for(const url of [...new Set([...bundle.courses,...bundle.tools].map(x=>x.coverUrl))]) {
    if(!/^\/morph-v17\/assets\/[a-zA-Z0-9_-]+\.(svg|png)$/.test(url))throw new Error('Unsafe asset path');
    const file=path.join(root,'admin-console/public',url.slice(1));
    const bytes=await readFile(file);await stat(file);
    bundle.assets.push({url,sha256:createHash('sha256').update(url.endsWith('.svg')?bytes.toString('utf8').replace(/\r\n/g,'\n'):bytes).digest('hex')});
  }
  await writeFile(path.join(root,'seed/morph-catalog/manifest.json'),JSON.stringify(bundle,null,2)+'\n');
  return {courses:bundle.courses.length,tools:bundle.tools.length,trial:bundle.courses.filter(c=>c.availability==='trial').length};
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  if(!process.argv[2])throw new Error('Usage: node scripts/prepare-morph-catalog.mjs <source frontend directory>');
  console.log(await prepare(process.argv[2]));
}
