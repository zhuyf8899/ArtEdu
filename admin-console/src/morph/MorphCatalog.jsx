import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, ArrowUpRight, Clock, CaretUp, CaretDown, ImageSquare, BookOpenText, Heart, BookmarkSimple } from '@phosphor-icons/react';
import { coverImageFor } from '../coverImages.js';
import { decorateCourse, difficultyName } from '../coursePresentation.js';
import { mountAtomic } from './atomicEffect.js';
import { mountNetwork } from './networkEffect.js';
import { mountFloating } from './floatingEffect.js';
import { morphCourseCover, morphQueryMatches } from './morphPresentation.js';
import { CatalogControls } from './CatalogControls.jsx';

export function MorphPageBanner({title,eyebrow,children}) {
  const root=useRef(null);
  useEffect(()=>({ATOMIC_COURSES:mountAtomic,CASE_COMMUNITY:mountNetwork,SKILL_TOOLS:mountFloating}[eyebrow.replaceAll(' ','_')]??mountAtomic)(root.current),[eyebrow]);
  return <header className="page-banner morph-page-banner" ref={root}><div className="container banner-copy"><div className="eyebrow">{eyebrow}</div><h1>{title}</h1></div>{children&&<div className="morph-banner-action">{children}</div>}<div className="banner-art" id="effect-stage"><canvas id="effect-canvas" aria-hidden="true"/></div></header>;
}
export function MorphCourseCard({course,onOpen}) {
  const c=decorateCourse(course),progress=Math.max(0,Math.min(100,Number(c.progressPercent)||0));
  return <article className="course-card morph-course-card"><div className="course-cover"><img src={coverImageFor({...c,coverImageUrl:morphCourseCover(c)},240,400)} alt={`${c.title}封面`} loading="lazy"/><span className="status">{progress>=100?'已完成':progress>0?'进行中':'未开始'}</span></div><div className="course-body"><div className="classification"><span>{c.category}</span><span>{difficultyName(c.difficulty)}</span></div><h2><button className="title-button" onClick={()=>onOpen(c.id)}>{c.title}</button></h2><p>{c.summary}</p><p className="course-teacher">授课作者：{c.author}</p><div className="chips morph-course-tools">{c.tools?.map(tool=><span className="chip" key={tool}>{tool}</span>)}</div><progress className="progress" aria-label={`${c.title}学习进度`} max="100" value={progress}/><div className="small-meta"><Clock size={14}/> {c.estimatedMinutes||0} 分钟 <span>{progress}%</span></div><div className="card-actions"><small>{c.lessonCount??0} 个课时 · {c.method}</small><button className="button" onClick={()=>onOpen(c.id)}>{progress>0?'继续学习':'查看课程'}<ArrowUpRight size={15}/></button></div></div></article>;
}
export function MorphCourseCatalog({courses,onOpen,onNavigate}) {
  const [category,setCategory]=useState('全部'),[query,setQuery]=useState(''),[method,setMethod]=useState(''),[author,setAuthor]=useState(''),[tool,setTool]=useState('');
  const decorated=useMemo(()=>courses.map(decorateCourse),[courses]), categories=['全部',...new Set(decorated.map(c=>c.category).filter(Boolean))];
  const visible=decorated.filter(c=>(category==='全部'||c.category===category)&&(!method||c.method===method)&&(!author||c.author===author)&&(!tool||c.tools.includes(tool))&&morphQueryMatches([c.title,c.summary,c.author,c.method,...c.tools],query));
  const reset=()=>{setCategory('全部');setQuery('');setMethod('');setAuthor('');setTool('');};
  const selected = [
    query && {label:`搜索：${query}`,onRemove:()=>setQuery('')},
    category !== '全部' && {label:category,onRemove:()=>setCategory('全部')},
    method && {label:method,onRemove:()=>setMethod('')},
    author && {label:author,onRemove:()=>setAuthor('')},
    tool && {label:tool,onRemove:()=>setTool('')},
  ].filter(Boolean);
  return <><MorphPageBanner title="原子课程" eyebrow="ATOMIC COURSES"/>
    <div className="container morph-catalog"><MorphCourseConnections courses={decorated} onOpen={onOpen} onNavigate={onNavigate}/>
      <CatalogControls label="课程筛选" options={categories.map(c=>({value:c,label:c,count:c==='全部'?courses.length:decorated.filter(x=>x.category===c).length}))}
        value={category} onChange={setCategory} query={query} onQueryChange={setQuery} searchLabel="搜索原子课程" placeholder="搜索课程、老师、工具"
        resultLabel={`${visible.length} / ${courses.length} 门课程`} selected={selected} onClear={reset}
        extra={<>
          <label>使用方法<select value={method} onChange={e=>setMethod(e.target.value)}><option value="">全部方法</option>{[...new Set(decorated.map(c=>c.method))].map(v=><option key={v}>{v}</option>)}</select></label>
          <label>授课作者<select value={author} onChange={e=>setAuthor(e.target.value)}><option value="">全部作者</option>{[...new Set(decorated.map(c=>c.author))].map(v=><option key={v}>{v}</option>)}</select></label>
          <label>创作工具<select value={tool} onChange={e=>setTool(e.target.value)}><option value="">全部工具</option>{[...new Set(decorated.flatMap(c=>c.tools))].map(v=><option key={v}>{v}</option>)}</select></label>
        </>}/>
      {visible.length?<div className="course-grid">{visible.map(c=><MorphCourseCard key={c.id} course={c} onOpen={onOpen}/>)}</div>:<div className="empty"><BookOpenText size={30}/><h2>没有匹配的课程</h2><button className="button secondary" onClick={reset}>清除筛选</button></div>}
    </div></>;

}
function MorphCourseConnections({courses,onOpen,onNavigate}) {
  const [expanded,setExpanded]=useState(true);
  return <section className={`atom-connections${expanded?'':' atom-connections--collapsed'}`}>
    <div className="connection-heading"><div><span className="eyebrow">CONNECTED LEARNING</span><h2>让课程原子相互连接</h2></div>
      <div className="morph-connections-actions"><button type="button" className="morph-connections-toggle" aria-expanded={expanded} aria-controls="course-connection-preview" onClick={()=>setExpanded(!expanded)}>{expanded?'收起预览':'展开预览'}{expanded?<CaretUp size={15}/>:<CaretDown size={15}/>}</button>
        <div className="curriculum-entry"><button className="button" onClick={()=>onNavigate('/my-learning?view=portrait')}>我的专业画像 <ArrowUpRight size={17}/></button></div>
      </div>
    </div>
    <div id="course-connection-preview" hidden={!expanded}>{courses.length>0&&<div className="atom-map"><button className="atom-core" onClick={()=>onOpen(courses[0].id)}><span>从方法出发</span><strong>{courses[0].title}</strong><small>{courses[0].category} · {courses[0].method}</small></button><div className="atom-branches">{courses.slice(1,4).map(c=><button key={c.id} onClick={()=>onOpen(c.id)}><span>{c.category}</span><strong>{c.title}</strong><small>{c.method} · {c.lessonCount??0} 个课时</small></button>)}</div></div>}
      <p className="morph-connections-note">按主题探索课程；此处连线不代表先修要求，具体知识关系可在图谱中查看。</p>
    </div>
  </section>;
}

export function MorphCaseCard({work,onOpen}) {return <article className="case-card morph-case-card"><button className="case-cover" onClick={()=>onOpen(work)} aria-label={`查看 ${work.title}`}>{work.previewUrl?<img src={work.previewUrl} alt={work.title} loading="lazy"/>:<div className="morph-case-empty"><ImageSquare size={36}/><span>作品暂无封面</span></div>}<span className="case-category">{work.discipline||'艺术创作'}</span></button><div className="case-body"><small className="morph-case-author">{work.creators?.join('、')||work.author||'未署名'}</small><h2><button className="title-button" onClick={()=>onOpen(work)}>{work.title}</button></h2><p>{work.summary}</p><div className="chips">{[...new Set([...(work.methods??[]),...(work.tools??[])])].slice(0,4).map(t=><span key={t} className="chip">{t}</span>)}</div><div className="case-actions"><span className="metrics"><Heart size={15}/>{work.likeCount??0}<BookmarkSimple size={15}/>{work.favoriteCount??0}</span><button className="button secondary" onClick={()=>onOpen(work)}>查看案例 <ArrowUpRight size={15}/></button></div></div></article>;}
export function MorphHomeRecommendations({data,onNavigate}) {
  const strip=useRef(null);
  return <div className="home-recommendations container"><section className="home-section"><header className="home-section-heading"><div><span className="eyebrow">LEARN IN SMALL STEPS</span><h2>从一门原子课程开始</h2><p>用一段专注的时间，掌握一个能立即用于创作的设计方法。</p></div><div className="gallery-actions"><button className="gallery-arrow" aria-label="向前浏览课程" onClick={()=>strip.current?.scrollBy({left:-600,behavior:'smooth'})}><ArrowLeft size={18}/></button><button className="gallery-arrow" aria-label="向后浏览课程" onClick={()=>strip.current?.scrollBy({left:600,behavior:'smooth'})}><ArrowRight size={18}/></button><button className="morph-text-link" onClick={()=>onNavigate('/learning')}>查看全部 <ArrowUpRight size={16}/></button></div></header>{data.courses.length?<div className="home-course-strip" ref={strip} tabIndex={0} aria-label="原子课程，横向滚动">{data.courses.map(c=><MorphCourseCard key={c.id} course={c} onOpen={id=>onNavigate('/learning?course='+encodeURIComponent(id))}/>)}</div>:<p className="empty">暂无已发布课程</p>}</section><section className="home-section"><header className="home-section-heading"><div><span className="eyebrow">SELECTED WORKS</span><h2>精彩案例</h2><p>从真实创作中发现灵感，把值得学习的方法带回你的下一次设计。</p></div><button className="morph-text-link" onClick={()=>onNavigate('/community')}>查看全部 <ArrowUpRight size={16}/></button></header><div className="morph-home-cases">{data.works.slice(0,6).map(w=><MorphCaseCard key={w.id} work={w} onOpen={work=>onNavigate('/community?work='+encodeURIComponent(work.id))}/>)}</div>{!data.works.length&&<p className="empty">暂无已发布案例</p>}</section></div>;
}
