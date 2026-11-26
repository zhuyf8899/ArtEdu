import { CaseCoverImage } from '../CaseCoverImage.jsx';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, ArrowUpRight, Clock, Sparkle, ImageSquare, BookOpenText, BookmarkSimple } from '@phosphor-icons/react';
import { coverImageFor } from '../coverImages.js';
import { decorateCourse, courseReadiness } from '../coursePresentation.js';
import './content-catalog.css';
import { mountAtomic } from './atomicEffect.js';
import { mountFloating } from './floatingEffect.js';
import { morphCourseCover, morphQueryMatches, morphCourseLevel } from './morphPresentation.js';
import { CatalogControls } from './CatalogControls.jsx';
import { courseCardState, courseDirections } from './curriculumModel.js';
import { courseProgress } from '../courseProgress.js';
import { atomicRequest, getWork, toggleWorkReaction } from '../services/adminApi.js';
import { atomicCover } from './atomicParticlesModel.js';
import { withReturnTarget } from '../resourceContext.js';
import { caseCollectionLabel } from '../communityCollections.js';
import { atomicUrl } from '../atomicModel.js';
import {useScopedViewState} from '../useScopedViewState.js';

export function MorphPageBanner({title,eyebrow,children}) {
  const root=useRef(null);
  useEffect(()=>({ATOMIC_COURSES:mountAtomic,CASE_COMMUNITY:mountAtomic,SKILL_TOOLS:mountFloating}[eyebrow.replaceAll(' ','_')]??mountAtomic)(root.current),[eyebrow]);
  return <header className="page-banner morph-page-banner" ref={root}><div className="container banner-copy"><div className="eyebrow">{eyebrow}</div><h1>{title}</h1></div>{children&&<div className="morph-banner-action">{children}</div>}<div className="banner-art" id="effect-stage"><canvas id="effect-canvas" aria-hidden="true"/></div></header>;
}
export function MorphCourseCard({course,onOpen,onCompose}) {
  const c=decorateCourse(course),progress=courseProgress(c),readiness=courseReadiness(c),archived=Boolean(c.archived||c.status==='archived'),soon=c.availability==='coming_soon';
  const open=()=>onOpen(archived?'':c.id);
  const state=courseCardState(c);
  return <article className={`course-card morph-course-card${archived?' is-archived':''}`} data-learning-state={state.tone==='done'?'completed':progress>0?'in_progress':'not_started'}>
    <div className="course-cover"><img src={coverImageFor({...c,coverImageUrl:morphCourseCover(c)},240,400)} alt={`${c.title}封面`} loading="lazy"/><span className={`status ${state.tone}`}>{state.label}</span></div>
    <div className="course-body">
      <div className="classification"><span>{c.category}</span><span>难度：{morphCourseLevel(c)}</span></div>
      <h2><button className="title-button" onClick={open}>{c.title}</button></h2><p>{c.summary}</p>
      <p className="course-teacher">老师：{c.teacherName || c.author}{readiness&&<small className="course-readiness">{readiness}</small>}</p>
      {!soon&&<progress className={`progress${progress>=100?' complete':''}`} aria-label={`${c.title}学习进度`} aria-valuetext={`${state.label}，${progress}%`} max="100" value={progress}/>}
      <div className="small-meta"><span><Clock size={14}/> 耗时 {c.estimatedMinutes||0} 分钟{soon?' · 规划时长':''}</span>{!soon&&<span className="course-progress-value">{progress>0?`${progress}%`:'未开始'}</span>}</div>
      <div className="card-actions"><div className="buttons">{onCompose && !archived ? <><button className="button secondary" onClick={() => onCompose(c.id)}>组合我的课程</button><button className="button" onClick={open}>查看详情<ArrowUpRight size={15}/></button></> : <><button className="button secondary" onClick={open}>查看详情</button><button className="button" onClick={open}>{state.action}<ArrowUpRight size={15}/></button></>}</div></div>
    </div>
  </article>;
}
export function MorphCourseCatalog({courses,onOpen,onNavigate,embedded=false,accountId='current'}) {
  const [category,setCategory]=useScopedViewState(accountId+':catalog:category','全部'),[query,setQuery]=useScopedViewState(accountId+':catalog:query',''),[readiness,setReadiness]=useScopedViewState(accountId+':catalog:readiness','available');
  const decorated=useMemo(()=>courses.map(decorateCourse),[courses]), categories=[...new Set([...courseDirections,...decorated.map(c=>c.category).filter(Boolean)])];
  const visible=decorated.filter(c=>(readiness==='all'||(readiness==='planned'?c.availability==='coming_soon':c.availability!=='coming_soon'))&&(category==='全部'||c.category===category)&&morphQueryMatches([c.title,c.summary,c.teacherName,c.author,c.method,...c.tools],query));
  const reset=()=>{setCategory('全部');setQuery('');};
  const selected = [
    query && {label:`搜索：${query}`,onRemove:()=>setQuery('')},
    category !== '全部' && {label:category,onRemove:()=>setCategory('全部')},
  ].filter(Boolean);
  return <>{!embedded&&<MorphPageBanner title="原子课程" eyebrow="ATOMIC COURSES"/>}
    <div className="container morph-catalog"><nav className="audit-filter-tabs" aria-label="课程开放状态">{[['available','现在可学'],['planned','筹备课程'],['all','全部目录']].map(([id,label])=><button key={id} aria-pressed={readiness===id} onClick={()=>setReadiness(id)}>{label} {decorated.filter(c=>id==='all'||(id==='planned'?c.availability==='coming_soon':c.availability!=='coming_soon')).length}</button>)}</nav><p className="catalog-notice">先从开放试学内容开始。筹备课程仅展示规划；作者与教研状态以课程详情为准。</p>{readiness!=='available'&&<MorphCourseConnections courses={decorated} onOpen={onOpen} onNavigate={onNavigate}/>}<button className="button secondary" onClick={()=>onNavigate('/curriculum')}>课程路径建议 ↗</button>
      <CatalogControls compact label="课程筛选" options={categories.map(c=>({value:c,label:c,count:c==='全部'?courses.length:decorated.filter(x=>x.category===c).length}))}
        value={category} onChange={setCategory} query={query} onQueryChange={setQuery} searchLabel="搜索原子课程" placeholder="搜索原子课程…"
        resultLabel={`${visible.length} / ${courses.length} 门课程`} selected={selected} onClear={reset}/>
      {visible.length?<div className="course-grid">{visible.map(c=><MorphCourseCard key={c.id} course={c} onOpen={onOpen} onCompose={id=>onNavigate(withReturnTarget('/curriculum?course='+encodeURIComponent(id)))}/>)}</div>:<div className="empty"><BookOpenText size={30}/><h2>没有匹配的课程</h2><button className="button secondary" onClick={reset}>清除筛选</button></div>}

    </div></>;

}
function MorphCourseConnections({courses,onOpen,onNavigate}) {
  const core=courses.find(c=>c.catalog?.code==='DTH-10');
  const branchSpecs=[['POS-11','视觉传达','概念转译 · 色彩与版式'],['PRD-12','工业设计','需求洞察 · 形态与材质'],['INF-13','跨专业应用','问题定义 · 数据与叙事']];
  const branches=branchSpecs.map(([code,direction,hint])=>({course:courses.find(c=>c.catalog?.code===code),direction,hint})).filter(item=>item.course);
  return <section className="atom-connections">
    <div className="connection-heading"><div><span className="eyebrow">CONNECTED LEARNING</span><h2>让课程原子相互连接</h2></div>
      <div className="curriculum-entry"><button className="button" onClick={()=>onNavigate('/curriculum')}><Sparkle size={16}/>课程路径建议<ArrowUpRight size={17}/></button></div>
    </div>
    {core&&<div className="atom-map"><button className="atom-core" onClick={()=>onOpen(core.id)}><span>共同基础 · 方法原子</span><strong>{core.title}</strong><small>观察 → 定义 → 构想 → 验证</small></button><div className="atom-branches">{branches.map(({course:c,direction,hint})=><button key={c.id} onClick={()=>onOpen(c.id)}><span>{direction}</span><strong>{c.title}</strong><small>{hint}</small></button>)}</div></div>}
  </section>;
}

export function MorphCaseCard({work,onOpen}) {
  const [favorite,setFavorite]=useState(null);
  const [saving,setSaving]=useState(false);
  const [favoriteError,setFavoriteError]=useState('');
  const liked=favorite?.favorited??work.favorited;
  const toggleFavorite=async()=>{
    setSaving(true);setFavoriteError('');
    try {
      await toggleWorkReaction(work.id,'favorite');
      const updated=await getWork(encodeURIComponent(work.id));
      setFavorite({favorited:updated.favorited,favoriteCount:updated.favoriteCount});
    } catch(error) { setFavoriteError(error.message); }
    finally {setSaving(false);}
  };
  return <article className="case-card morph-case-card">
    <div className="morph-case-cover-wrap">
      <button className="case-cover" onClick={()=>onOpen(work)} aria-label={`查看 ${work.title}`}>{work.previewUrl?<CaseCoverImage src={work.previewUrl} alt={work.title}/>:<div className="morph-case-empty"><ImageSquare size={36}/><span>作品暂无封面</span></div>}<span className="case-card-badges"><span className="case-category">{work.discipline||'艺术创作'}</span><span className="case-collection-tag" data-collection={work.collection}>{caseCollectionLabel(work)}</span></span></button>
      <button className="morph-case-bookmark" type="button" aria-pressed={Boolean(liked)} aria-label={`${liked?'取消收藏':'收藏'} ${work.title}`} disabled={saving} onClick={toggleFavorite}><BookmarkSimple size={18} weight={liked?'fill':'regular'}/></button>
    </div>
    <div className="case-body">
      <h2><button className="title-button" onClick={()=>onOpen(work)}>{work.title}</button></h2>
      <p>{work.summary}</p>
      <div className="chips">{[...new Set([...(work.methods??[]),...(work.tools??[])])].slice(0,4).map(t=><span key={t} className="chip">{t}</span>)}</div>
      <div className="case-actions"><small className="morph-case-author">{work.creators?.join('、')||work.author||'未署名'}</small><button className="button" onClick={()=>onOpen(work)}>查看<span className="sr-only">案例</span></button></div>
      {favoriteError&&<p role="alert">{favoriteError}</p>}
    </div>
  </article>;
}

const handoffHomeAtoms = [
  {id:'morph-nov-teacher-metaphor',label:'节点课程 · 可视化方法',caption:'METAPHOR'},
  {id:'morph-nov-teacher-vibe',label:'节点课程 · AI 协同创作',caption:'VIBE'},
  {id:'morph-nov-zhang-media',label:'知识点',caption:'MEDIA COMPUTING'},
];
const handoffHomeCases = [
  'morph-nov-case-qipao',
  'work-763623bc-75e4-4e55-8920-94f00e1f7dd8',
  'work-52815e54-8eb4-4f63-8d1d-9f57c6aee132',
  'work-442627ce-0bc5-47c6-96ed-c80cd0015f4b',
];

function HomeNodeCard({item,onNavigate}) {
  const {id,payload,revision,label,caption,author}=item;
  const open=()=>onNavigate(withReturnTarget(atomicUrl(id,revision)));
  return <article className="morph-home-node">
    <div className="morph-home-node__art"><img src={atomicCover({...payload,id})} alt="" loading="lazy"/><span>{caption}</span></div>
    <div className="morph-home-node__content">
      <span className="morph-home-node__label">{label}</span>
      <h3><button className="title-button" onClick={open}>{payload.title}</button></h3>
      <p>{payload.summary}</p>
      {author&&<small className="morph-home-node__author">{author}</small>}
      <div className="morph-home-node__actions">
        <button className="button secondary" onClick={()=>onNavigate('/curriculum?topic='+encodeURIComponent(payload.title))}>组合我的课程</button>
        <button className="button" onClick={open}>查看详情</button>
      </div>
    </div>
  </article>;
}

export function MorphHomeRecommendations({data,onNavigate,accountId}) {
  const strip=useRef(null);
  const [nodes,setNodes]=useState(null);
  const [cases,setCases]=useState([]);
  const [scrollEdges,setScrollEdges]=useState({previous:false,next:false});
  useEffect(()=>{
    let active=true;
    setNodes(null);setCases([]);
    const loadNodes=handoffHomeAtoms.map(async presentation=>{
      const node=await atomicRequest('/nodes/'+presentation.id);
      return {...node,...presentation,author:node.payload.teacherName||node.payload.source?.split(' · ')[1]};
    });
    Promise.allSettled(loadNodes).then(results=>{
      if(active)setNodes(results.filter(result=>result.status==='fulfilled').map(result=>result.value));
    });
    Promise.allSettled(handoffHomeCases.map(id=>getWork(id))).then(results=>{
      if(active)setCases(results.filter(result=>result.status==='fulfilled'&&result.value.status==='approved').map(result=>result.value));
    });
    return()=>{active=false;};
  },[accountId]);
  useEffect(()=>{
    const gallery=strip.current;
    if(!gallery)return;
    const sync=()=>setScrollEdges({previous:gallery.scrollLeft>4,next:gallery.scrollLeft+gallery.clientWidth<gallery.scrollWidth-4});
    const resize=new ResizeObserver(sync);
    resize.observe(gallery);gallery.addEventListener('scroll',sync,{passive:true});sync();
    return()=>{resize.disconnect();gallery.removeEventListener('scroll',sync);};
  },[nodes,data.courses]);
  const byId=new Map([...cases,...data.works.filter(work=>!cases.some(item=>item.id===work.id))].map(work=>[work.id,work]));
  const featured=[...byId.values()].slice(0,4);
  const available=data.courses.filter(course=>course.availability!=='coming_soon');
  const move=direction=>{
    const gallery=strip.current;
    const first=gallery?.firstElementChild;
    if(first)gallery.scrollBy({left:direction*(first.getBoundingClientRect().width+24),behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
  };
  return <div className="home-recommendations container">
    <section className="home-section">
      <header className="home-section-heading">
        <div><span className="eyebrow">LEARN IN SMALL STEPS</span><h2>从一门原子课程开始</h2><p>用一段专注的时间，掌握一个能立即用于创作的设计方法。</p></div>
        <div className="gallery-actions"><button className="gallery-arrow" aria-label="向前浏览课程" disabled={!scrollEdges.previous} onClick={()=>move(-1)}><ArrowLeft size={18}/></button><button className="gallery-arrow" aria-label="向后浏览课程" disabled={!scrollEdges.next} onClick={()=>move(1)}><ArrowRight size={18}/></button><button className="morph-text-link" onClick={()=>onNavigate('/learning?library=atoms')}>查看全部</button></div>
      </header>
      {nodes===null?<p className="empty" role="status">正在加载原子课程…</p>:nodes.length||available.length?<div className="home-course-strip" ref={strip} tabIndex={0} aria-label="原子课程，横向滚动">
        {nodes.map(item=><HomeNodeCard key={item.id} item={item} onNavigate={onNavigate}/>)}
        {!nodes.length&&available.map(course=><MorphCourseCard key={course.id} course={course} onOpen={id=>onNavigate('/learning?course='+encodeURIComponent(id))}/>)}
      </div>:<p className="empty">暂无已发布课程</p>}
    </section>
    <section className="home-section">
      <header className="home-section-heading"><div><span className="eyebrow">SELECTED WORKS</span><h2>精彩案例</h2><p>从真实创作中发现灵感，把值得学习的方法带回你的下一次设计。</p></div><button className="morph-text-link" onClick={()=>onNavigate('/community')}>查看全部</button></header>
      <div className="morph-home-cases">{featured.map(work=><MorphCaseCard key={work.id} work={work} onOpen={item=>onNavigate('/community?work='+encodeURIComponent(item.id))}/>)}</div>
      {!featured.length&&<p className="empty">暂无已发布案例</p>}
    </section>
  </div>;
}
