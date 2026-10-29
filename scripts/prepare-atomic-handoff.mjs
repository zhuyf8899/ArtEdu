import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const input=process.argv[2];if(!input)throw Error('Supply the captured public handoff directory');
const read=name=>readFile(path.join(input,name),'utf8').then(JSON.parse),sha=s=>createHash('sha256').update(s).digest('hex');
const catalog=await read('catalog.json'),sessions=await read('normalized-sessions.json'),covers=await read('covers.json');
if(catalog.length!==17||sessions.length!==10)throw Error('Unexpected handoff version');
const site='https://morph-lab-design-platform.wj27398.chatgpt.site',seriesUrl=site+'/infographic-design',catalogUrl=site+'/atomic-courses-particles';
const atomId=title=>'morph-handoff-atom-'+sha(title).slice(0,16),courseId='morph-handoff-infographic-2026';
const url=id=>'/learning?library=atoms&node='+id+'&revision=1';
const aliases={'Data Diary':'数据日志','科学可视化设计与问答':'科学可视化'};
const records=new Map(catalog.map(c=>[c.title,{catalog:c,title:c.title,sessions:[],topics:[]}]))
for(const s of sessions)for(const t of s.topics){const title=aliases[t.title]||t.title;if(!records.has(title))records.set(title,{title,sessions:[],topics:[]});const row=records.get(title);row.sessions.push(s);row.topics.push(t);}
const media=[],omittedMedia=[],nodes=[],coverMap={},coverAssets=[];
const out=path.join(root,'seed/atomic-handoff');await mkdir(out+'/media',{recursive:true});
const coverDir=path.join(root,'admin-console/public/morph-course-network/handoff');await mkdir(coverDir,{recursive:true});
const relativeCover=filename=>'/morph-course-network/handoff/'+filename;
for(const c of covers){const filename=c.src.split('/').at(-1),bytes=await readFile(path.join(input,'covers',filename));if(filename.endsWith('.svg')&&/<script|foreignObject|\bon\w+\s*=|(?:href|src)\s*=\s*["'](?:https?:|javascript:)/i.test(bytes.toString()))throw Error('Unsafe source SVG');await copyFile(path.join(input,'covers',filename),path.join(coverDir,filename));coverMap[atomId(c.title)]=relativeCover(filename);if(!coverAssets.some(a=>a.filename===filename))coverAssets.push({filename,sha256:sha(bytes),size:bytes.length});}
for(const row of records.values()){
 const t=row.topics[0],c=row.catalog,title=row.title,id=atomId(title),points=t?.points||[],isExample=Boolean(c&&c.index>=4);
 const summary=c?.paragraphs[2]||`《信息图表设计》课程节点：${title}。按交接稿提供教学安排与现有知识大纲，完整课程资料待接入。`;
 const knowledge=[...new Set([title,...(t&&t.title!==title?[t.title]:[]),...points.map(p=>p.title)])].slice(0,20);
 const notice=isExample?'交接目录示例：当前提供简介，尚未提供完整讲义、课件或视频。示例教师姓名和学习百分比不作为真实记录导入。':'交接课程大纲：同步原稿已提供的介绍与知识节点。详细讲义、课件与视频尚未随交接网页提供。';
 const lines=[`> ${notice}`,'',summary,''];
 if(t){lines.push('### 来源与教学安排',`原稿讲授者：${t.lecturer.replace(/\n/g,'；')}`,`所属课程：信息图表设计。${row.sessions.map(s=>s.schedule.replace(/\n+/g,' · ')).join('；')}`,'');}
 if(points.length){lines.push('### 原稿知识大纲',...points.map(p=>`${'  '.repeat(p.depth)}- ${p.title}`),'');}
 if(t?.children.length)lines.push('### 关联学习原子',...t.children.map(name=>`- [${name}](${url(atomId(aliases[name]||name))})`),'');
 if(row.sessions.some(s=>s.index===10)&&title==='最终作业陈述')lines.push('### 课程总结','原稿列出“课程总结”，其下级详细内容待补充。','');
 if(t)lines.push(`[查看《信息图表设计》完整课程路线](${url(courseId)})`,'');
 lines.push('### 资料状态','当前为大纲阅读与自我确认，不代表完成课堂学时或获得能力认证。后续教师可补充正式教学资源。',`[查看交接原稿](${t?seriesUrl:catalogUrl})`);
 const assetIds=[];
 for(const src of [...new Set(t?.images||[])]){const filename=src.split('/').at(-1),bytes=await readFile(path.join(input,'media',filename));if(bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw Error('Invalid PNG');if(bytes.readUInt32BE(16)<=32&&bytes.readUInt32BE(20)<=32){omittedMedia.push({filename,reason:'source-placeholder-32x32',sha256:sha(bytes)});continue;}const assetId='morph-handoff-asset-'+sha(id+filename).slice(0,20),storageKey='imported/morph-atomic-handoff-v1/'+id+'/'+filename;assetIds.push(assetId);media.push({id:assetId,nodeId:id,fileName:filename,mimeType:'image/png',size:bytes.length,sha256:sha(bytes),storageKey,filename});await copyFile(path.join(input,'media',filename),path.join(out,'media',filename));}
 const minutes=c?Number(c.paragraphs.at(-1).match(/耗时 (\d+) 分钟/)?.[1]||15):15;
 if(!c||c.index<4)lines.push('','大纲建议阅读时间：15 分钟（平台阅读建议，不替代原稿课程学时）。');
 nodes.push({id,kind:'teaching',catalogEntry:Boolean(c),sourceTitle:t?.title||title,sourceUrl:t?seriesUrl:catalogUrl,lecturer:t?.lecturer||'',readiness:'outline',payload:{title,summary,direction:c?.direction||(['CNN','AI 辅助设计'].includes(title)?'人工智能基础':'设计方法'),objective:`了解“${title}”的课程范围与现有知识大纲，明确后续需要学习的内容。`,content:lines.join('\n'),minutes,knowledge,tools:[],completion:'read',exercise:'',source:`MORPH LAB 交接课程；${t?'原稿讲授者：'+t.lecturer+'；':''}${t?seriesUrl:catalogUrl}；仅同步现有大纲与图示，不含示例学习进度。`,assetIds,...(title==='色彩构成基础'?{visual:'color'}:title==='字体认知'?{visual:'type'}:title==='版式网格入门'?{visual:'grid'}:{})}});
}
const steps=[];
for(const s of sessions)for(const t of s.topics){const id=atomId(aliases[t.title]||t.title);if(steps.some(x=>x.atomId===id))continue;const row=records.get(aliases[t.title]||t.title);steps.push({atomId:id,revision:1,required:true,prerequisites:[],task:'',context:`${row.sessions.map(x=>x.schedule.replace(/\n+/g,' · ')).join('；')}。原稿节点：${t.title}。${row.sessions.length>1?'多次课堂复用同一原子与学习记录。':''}当前同步课程大纲，完整讲义待接入。`});}
nodes.push({id:courseId,kind:'course',sourceUrl:seriesUrl,readiness:'outline',payload:{title:'信息图表设计（数据分析与可视化表达）',summary:'清华大学美术学院专业基础课，原稿主讲吴琼；2026 秋季，10 次课、32 学时。以可视化思维观察和理解世界，探索数据、信息与人的关系。本次同步17个可复用节点与已有大纲，课堂讲义和视频待补充；完成记录仅表示大纲阅读。',steps}});
const bundle={id:'morph-atomic-handoff-20261028-v1',version:1,source:{catalog:catalogUrl,series:seriesUrl,capturedAt:'2026-10-28',catalogEntries:17,sessions:10,seriesHours:32,notice:'原稿目录及大纲，不含完整讲义/视频、示例教师账号或示例学习记录。'},publisher:{id:'morph-handoff-library',username:'morph-handoff-library',displayName:'MORPH LAB 课程资料库',status:'disabled'},nodes,media,omittedMedia,coverAssets};
await writeFile(out+'/manifest.json',JSON.stringify(bundle,null,2)+'\n');
await writeFile(path.join(root,'admin-console/src/morph/handoffAtomicCovers.json'),JSON.stringify(coverMap,null,2)+'\n');
console.log(JSON.stringify({atoms:nodes.filter(n=>n.kind==='teaching').length,catalogEntries:17,courseSteps:steps.length,courses:1,attachments:media.length,coverFiles:coverAssets.length}));
