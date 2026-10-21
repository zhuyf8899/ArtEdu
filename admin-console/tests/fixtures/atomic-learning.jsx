// UI fixture only. All content and changes stay in memory; no platform data is written.
import React,{useEffect,useState} from 'react';
import { createRoot } from 'react-dom/client';
import { AtomicLearningHub } from '../../src/AtomicLearningHub.jsx';
import { FeedbackProvider } from '../../src/FeedbackCenter.jsx';
const requestedRole=new URLSearchParams(location.search).get('role');
const fixtureRole=['student','admin','operator'].includes(requestedRole)?requestedRole:'teacher';
const titles=['理解色彩的冷暖关系','识别画面的视觉层级','字体的情绪与可读性','用网格建立版面秩序','从观察到海报实践'];
const atoms=titles.map((title,i)=>({id:'fixture-'+i,kind:'teaching',revision:1,status:'published',author:'教学样例作者',title,summary:'从真实设计问题出发，通过观察、比较与实践，建立自己的判断方法。',knowledge:['设计基础',i?'视觉表达':'色彩对比'],minutes:15,stage:i===0?'completed':null}));
const course={id:'fixture-course',kind:'course',ownerId:'teacher-fixture',revision:1,status:'published',publishedRevision:1,payload:{title:'海报设计：从观察到表达',summary:'沿着五个可复用的学习原子，建立视觉表达能力，完成属于自己的海报。'},progress:null,assets:[],branches:[],usedBy:[],versions:[{revision:1}],feedback:[],steps:atoms.map((a,i)=>({atomId:a.id,revision:1,title:a.title,summary:a.summary,stage:a.stage,latestRevision:i===0?2:1,available:true,required:i!==4,context:['理解色彩如何影响画面的情绪和阅读顺序。','观察哪些信息最先被看见，再确定主次关系。','选择适合表达目标的文字层级。','将视觉元素组织成清晰、有节奏的版面。','综合使用已学知识，完成海报练习。'][i],task:i===3?'以一张展览海报为主题，解释你的版面组织与网格选择。':'',taskProgress:null,prerequisites:i?[atoms[i-1].id]:[]}))};
const detail={...atoms[0],ownerId:'teacher-fixture',publishedRevision:2,payload:{title:titles[0],summary:'认识冷暖色调如何塑造情绪，让配色成为有依据的设计选择。',objective:'能够识别冷暖关系，并用两组配色解释不同的视觉情绪。',minutes:15,knowledge:['色彩对比','视觉情绪'],tools:['Figma'],completion:'read',exercise:'观察一幅作品，列出其中的冷色与暖色，并说明它们的作用。',content:'## 从观察开始\n\n颜色并不只有名称，它还通过相互关系影响我们的感受。先观察主色与背景，再比较冷暖比例。\n\n### 两个观察问题\n\n- 哪一种色调占据主导？\n- 对比最明显的区域，是否也是视觉中心？\n\n## 将理解转化为实践\n\n用同一个主题制作两组配色：一组偏冷，一组偏暖。保留相同的构图，观察情绪如何变化。',source:'隔离界面验收样例，不属于正式课程。',assetIds:[]},progress:{stage:'completed'},assets:[],branches:[{id:'reflection',title:'我如何用冷暖对比改善海报',author:'学习者样例',revision:1}],usedBy:[{id:course.id,title:course.payload.title,revision:1},{id:'brand',title:'品牌视觉设计入门',revision:1}],versions:[{revision:2},{revision:1}],feedback:[]};
const insight={...detail,id:'fixture-reflection',kind:'reflection',ownerId:'student-fixture',parentId:detail.id,parentTitle:detail.payload.title,publishedRevision:null,revision:1,status:'pending_review',canReview:fixtureRole!=='student',payload:{...detail.payload,title:'我如何用冷暖对比改善海报',summary:'比较两组海报配色，记录冷暖比例对情绪与视觉层级的影响。',content:'## 我的观察\n\n我保留了相同的海报构图，分别尝试冷色背景和暖色背景。小面积的暖色能够吸引注意，但对比过强时也会打断信息阅读。\n\n## 实践与反思\n\n第二次练习中，我降低了背景饱和度，并将暖色集中在标题和日期上，让视觉顺序更清晰。下一步会比较不同明度下的阅读效果。'},progress:null,assets:[],branches:[],usedBy:[],versions:[],feedback:[]};
insight.stage=null;
window.fetch=async (input,options={})=>{
 const url=new URL(input,location.origin);let data;
 if(url.pathname.endsWith('/catalog')){
  const view=url.searchParams.get('view');let items=view==='review'?(insight.status==='pending_review'?[{...insight,title:insight.payload.title,summary:insight.payload.summary,author:'学习者样例'}]:[]):view==='courses'?[{...course,title:course.payload.title,summary:course.payload.summary,author:'教学样例作者'}]:atoms;
  const query=url.searchParams.get('query');if(query)items=items.filter(item=>(item.title+item.summary).includes(query));data={items,total:items.length};
 }else if(url.pathname.endsWith('/decision')){
  const body=JSON.parse(options.body);insight.status=body.decision==='publish'?'published':'rejected';insight.canReview=false;insight.feedback=[{action:body.decision,note:body.note}];if(insight.status==='published'){insight.publishedRevision=1;detail.branches=[{id:insight.id,title:insight.payload.title,author:'学习者样例',revision:1}];}data={status:insight.status};
 }else if(url.pathname.includes('/nodes/'))data=url.pathname.endsWith('/fixture-course')?course:url.pathname.endsWith('/fixture-reflection')?insight:detail;
 else data={items:[]};
 return new Response(JSON.stringify(data),{headers:{'content-type':'application/json'}});
};
document.body.style.cssText='margin:0;background:#eeebf7;font-family:Arial,"Microsoft YaHei",sans-serif';
function Fixture(){
 const [route,setRoute]=useState(location.hash.slice(1)||'/learning?library=atoms');
 useEffect(()=>{const sync=()=>setRoute(location.hash.slice(1)||'/learning?library=atoms');sync();addEventListener('hashchange',sync);return()=>removeEventListener('hashchange',sync);},[]);
 const p=new URL(route,location.origin).searchParams;
 return <FeedbackProvider><div style={{padding:'12px 28px',fontSize:12,color:'#856aa1',borderBottom:'1px solid #e3d9f0'}}>隔离 UI 验收 · {fixtureRole==='student'?'纯学生角色':'教师角色'} · 所有内容均为内存样例，不写入平台数据库</div>
  <AtomicLearningHub account={{id:fixtureRole+'-fixture',roles:[fixtureRole],name:fixtureRole==='student'?'学生样例':'教师样例'}} library={p.get('library')||'atoms'} nodeId={p.get('node')||''} revision={p.get('revision')||''} legacy={<p>原有课程入口保留</p>} onNavigate={to=>{const target=new URL(to,location.origin);target.searchParams.set('role',fixtureRole);history.replaceState({},'',location.pathname+target.search+'#'+to);setRoute(to);}}/>
 </FeedbackProvider>;
}
createRoot(document.getElementById('root')).render(<Fixture/>);
