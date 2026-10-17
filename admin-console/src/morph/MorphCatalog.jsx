import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, ArrowUpRight, Clock, Sparkle, ImageSquare, BookOpenText, Heart, BookmarkSimple } from '@phosphor-icons/react';
import { coverImageFor } from '../coverImages.js';
import { decorateCourse, courseReadiness } from '../coursePresentation.js';
import './content-catalog.css';
import { mountAtomic } from './atomicEffect.js';
import { mountNetwork } from './networkEffect.js';
import { mountFloating } from './floatingEffect.js';
import { morphCourseCover, morphQueryMatches, morphCourseLevel } from './morphPresentation.js';
import { CatalogControls } from './CatalogControls.jsx';
import { courseCardState, courseDirections } from './curriculumModel.js';

export function MorphPageBanner({title,eyebrow,children}) {
  const root=useRef(null);
  useEffect(()=>({ATOMIC_COURSES:mountAtomic,CASE_COMMUNITY:mountNetwork,SKILL_TOOLS:mountFloating}[eyebrow.replaceAll(' ','_')]??mountAtomic)(root.current),[eyebrow]);
  return <header className="page-banner morph-page-banner" ref={root}><div className="container banner-copy"><div className="eyebrow">{eyebrow}</div><h1>{title}</h1></div>{children&&<div className="morph-banner-action">{children}</div>}<div className="banner-art" id="effect-stage"><canvas id="effect-canvas" aria-hidden="true"/></div></header>;
}
export function MorphCourseCard({course,onOpen}) {
  const c=decorateCourse(course),progress=Math.max(0,Math.min(100,Number(c.progressPercent)||0)),readiness=courseReadiness(c),archived=Boolean(c.archived||c.status==='archived'),soon=c.availability==='coming_soon';
  const open=()=>onOpen(archived?'':c.id);
  const state=courseCardState(c);
  return <article className={`course-card morph-course-card${archived?' is-archived':''}`}><div className="course-cover"><img src={coverImageFor({...c,coverImageUrl:morphCourseCover(c)},240,400)} alt={`${c.title}封面`} loading="lazy"/><span className={`status ${state.tone}`}>{state.label}</span></div><div className="course-body"><div className="classification"><span>{c.category}</span><span>难度：{morphCourseLevel(c)}</span></div><h2><button className="title-button" onClick={open}>{c.title}</button></h2><p>{c.summary}</p><p className="course-teacher">老师：{c.author}{readiness&&<small className="course-readiness">{readiness}</small>}</p>{!soon&&<progress className="progress" aria-label={`${c.title}学习进度`} max="100" value={progress}/>}<div className="small-meta"><span><Clock size={14}/> 耗时 {c.estimatedMinutes||0} 分钟{soon?' · 规划时长':''}</span>{!soon&&<span>{progress>0?`${progress}%`:'未开始'}</span>}</div><div className="card-actions"><div className="buttons"><button className="button secondary" onClick={open}>查看详情</button><button className="button" onClick={open}>{state.action}<ArrowUpRight size={15}/></button></div></div></div></article>;
}
export function MorphCourseCatalog({courses,onOpen,onNavigate}) {
  const [category,setCategory]=useState('全部'),[query,setQuery]=useState('');
  const decorated=useMemo(()=>courses.map(decorateCourse),[courses]), categories=[...new Set([...courseDirections,...decorated.map(c=>c.category).filter(Boolean)])];
  const visible=decorated.filter(c=>(category==='全部'||c.category===category)&&morphQueryMatches([c.title,c.summary,c.author,c.method,...c.tools],query));
  const reset=()=>{setCategory('全部');setQuery('');};
  const selected = [
    query && {label:`搜索：${query}`,onRemove:()=>setQuery('')},
    category !== '全部' && {label:category,onRemove:()=>setCategory('全部')},
  ].filter(Boolean);
  return <><MorphPageBanner title="原子课程" eyebrow="ATOMIC COURSES"/>
    <div className="container morph-catalog"><MorphCourseConnections courses={decorated} onOpen={onOpen} onNavigate={onNavigate}/>
      <CatalogControls compact label="课程筛选" options={categories.map(c=>({value:c,label:c,count:c==='全部'?courses.length:decorated.filter(x=>x.category===c).length}))}
        value={category} onChange={setCategory} query={query} onQueryChange={setQuery} searchLabel="搜索原子课程" placeholder="搜索原子课程…"
        resultLabel={`${visible.length} / ${courses.length} 门课程`} selected={selected} onClear={reset}/>
      {visible.length?<div className="course-grid">{visible.map(c=><MorphCourseCard key={c.id} course={c} onOpen={onOpen}/>)}</div>:<div className="empty"><BookOpenText size={30}/><h2>没有匹配的课程</h2><button className="button secondary" onClick={reset}>清除筛选</button></div>}
      {courses.some(c=>c.catalog?.bundleId)&&<p className="morph-catalog-footnote">课程状态以实际开放情况为准，试学内容待教研审核；筹备课程仅提供规划预览。学习进度来自你的实际记录，课程连线为探索建议，不代表正式先修要求。</p>}
    </div></>;

}
function MorphCourseConnections({courses,onOpen,onNavigate}) {
  const core=courses.find(c=>c.catalog?.code==='DTH-10');
  const branchSpecs=[['POS-11','视觉传达','概念转译 · 色彩与版式'],['PRD-12','工业设计','需求洞察 · 形态与材质'],['INF-13','跨专业应用','问题定义 · 数据与叙事']];
  const branches=branchSpecs.map(([code,direction,hint])=>({course:courses.find(c=>c.catalog?.code===code),direction,hint})).filter(item=>item.course);
  return <section className="atom-connections">
    <div className="connection-heading"><div><span className="eyebrow">CONNECTED LEARNING</span><h2>让课程原子相互连接</h2></div>
      <div className="curriculum-entry"><button className="button" onClick={()=>onNavigate('/curriculum')}><Sparkle size={16}/>AI 编排课程体系<ArrowUpRight size={17}/></button></div>
    </div>
    {core&&<div className="atom-map"><button className="atom-core" onClick={()=>onOpen(core.id)}><span>共同基础 · 方法原子</span><strong>{core.title}</strong><small>观察 → 定义 → 构想 → 验证</small></button><div className="atom-branches">{branches.map(({course:c,direction,hint})=><button key={c.id} onClick={()=>onOpen(c.id)}><span>{direction}</span><strong>{c.title}</strong><small>{hint}</small></button>)}</div></div>}
  </section>;
}

export function MorphCaseCard({work,onOpen}) {return <article className="case-card morph-case-card"><button className="case-cover" onClick={()=>onOpen(work)} aria-label={`查看 ${work.title}`}>{work.previewUrl?<img src={work.previewUrl} alt={work.title} loading="lazy"/>:<div className="morph-case-empty"><ImageSquare size={36}/><span>作品暂无封面</span></div>}<span className="case-category">{work.discipline||'艺术创作'}</span></button><div className="case-body"><small className="morph-case-author">{work.creators?.join('、')||work.author||'未署名'}</small><h2><button className="title-button" onClick={()=>onOpen(work)}>{work.title}</button></h2><p>{work.summary}</p><div className="chips">{[...new Set([...(work.methods??[]),...(work.tools??[])])].slice(0,4).map(t=><span key={t} className="chip">{t}</span>)}</div><div className="case-actions"><span className="metrics"><Heart size={15}/>{work.likeCount??0}<BookmarkSimple size={15}/>{work.favoriteCount??0}</span><button className="button secondary" onClick={()=>onOpen(work)}>查看案例 <ArrowUpRight size={15}/></button></div></div></article>;}
export function MorphHomeRecommendations({data,onNavigate}) {
  const strip=useRef(null);
  return <div className="home-recommendations container"><section className="home-section"><header className="home-section-heading"><div><span className="eyebrow">LEARN IN SMALL STEPS</span><h2>从一门原子课程开始</h2><p>用一段专注的时间，掌握一个能立即用于创作的设计方法。</p></div><div className="gallery-actions"><button className="gallery-arrow" aria-label="向前浏览课程" onClick={()=>strip.current?.scrollBy({left:-600,behavior:'smooth'})}><ArrowLeft size={18}/></button><button className="gallery-arrow" aria-label="向后浏览课程" onClick={()=>strip.current?.scrollBy({left:600,behavior:'smooth'})}><ArrowRight size={18}/></button><button className="morph-text-link" onClick={()=>onNavigate('/learning')}>查看全部 <ArrowUpRight size={16}/></button></div></header>{data.courses.length?<div className="home-course-strip" ref={strip} tabIndex={0} aria-label="原子课程，横向滚动">{data.courses.map(c=><MorphCourseCard key={c.id} course={c} onOpen={id=>onNavigate('/learning?course='+encodeURIComponent(id))}/>)}</div>:<p className="empty">暂无已发布课程</p>}</section><section className="home-section"><header className="home-section-heading"><div><span className="eyebrow">SELECTED WORKS</span><h2>精彩案例</h2><p>从真实创作中发现灵感，把值得学习的方法带回你的下一次设计。</p></div><button className="morph-text-link" onClick={()=>onNavigate('/community')}>查看全部 <ArrowUpRight size={16}/></button></header><div className="morph-home-cases">{data.works.slice(0,6).map(w=><MorphCaseCard key={w.id} work={w} onOpen={work=>onNavigate('/community?work='+encodeURIComponent(work.id))}/>)}</div>{!data.works.length&&<p className="empty">暂无已发布案例</p>}</section></div>;
}
