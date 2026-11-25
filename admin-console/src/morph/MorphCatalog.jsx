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
import { courseProgress } from '../courseProgress.js';
import {useScopedViewState} from '../useScopedViewState.js';
import {withReturnTarget} from '../resourceContext.js';
import { atomicRequest } from '../services/adminApi.js';
import { atomicUrl } from '../atomicModel.js';
import { atomicCardState, atomicCover } from './atomicParticlesModel.js';
import { MorphLink } from './MorphChrome.jsx';
import './home-recommendations.css';

export function MorphPageBanner({title,eyebrow,children}) {
  const root=useRef(null);
  useEffect(()=>({ATOMIC_COURSES:mountAtomic,CASE_COMMUNITY:mountNetwork,SKILL_TOOLS:mountFloating}[eyebrow.replaceAll(' ','_')]??mountAtomic)(root.current),[eyebrow]);
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

export function MorphCaseCard({work,onOpen}) {return <article className="case-card morph-case-card"><button className="case-cover" onClick={()=>onOpen(work)} aria-label={`查看 ${work.title}`}>{work.previewUrl?<img src={work.previewUrl} alt={work.title} loading="lazy"/>:<div className="morph-case-empty"><ImageSquare size={36}/><span>作品暂无封面</span></div>}<span className="case-category">{work.discipline||'艺术创作'}</span></button><div className="case-body"><small className="morph-case-author">{work.creators?.join('、')||work.author||'未署名'}</small><h2><button className="title-button" onClick={()=>onOpen(work)}>{work.title}</button></h2><p>{work.summary}</p><div className="chips">{[...new Set([...(work.methods??[]),...(work.tools??[])])].slice(0,4).map(t=><span key={t} className="chip">{t}</span>)}</div><div className="case-actions"><span className="metrics"><Heart size={15}/>{work.likeCount??0}<BookmarkSimple size={15}/>{work.favoriteCount??0}</span><button className="button secondary" onClick={()=>onOpen(work)}>查看案例 <ArrowUpRight size={15}/></button></div></div></article>;}
export function MorphHomeRecommendations({ data, onNavigate }) {
  const strip = useRef(null);
  const [atoms, setAtoms] = useState([]);
  const [loadState, setLoadState] = useState('loading');
  const [attempt, setAttempt] = useState(0);
  const [scroll, setScroll] = useState({ back: false, forward: false });

  useEffect(() => {
    let active = true;
    async function loadAtoms() {
      const recommended = [];
      let seen = 0;
      try {
        for (let page = 1; active && page <= 10000; page += 1) {
          const { items, total } = await atomicRequest(`/catalog?view=atoms&page=${page}`);
          recommended.push(...items.filter(item => item.kind === 'teaching' && item.status === 'published'));
          seen += items.length;
          if (recommended.length >= 8 || seen >= total || !items.length) break;
        }
        if (active) {
          setAtoms(recommended.slice(0, 8));
          setLoadState('ready');
        }
      } catch {
        if (active) setLoadState('error');
      }
    }
    void loadAtoms();
    return () => { active = false; };
  }, [attempt]);

  useEffect(() => {
    const rail = strip.current;
    if (!rail) return;
    const measure = () => setScroll({
      back: rail.scrollLeft > 1,
      forward: rail.scrollWidth - rail.clientWidth - rail.scrollLeft > 1,
    });
    const observer = new ResizeObserver(measure);
    observer.observe(rail);
    rail.addEventListener('scroll', measure, { passive: true });
    measure();
    return () => {
      observer.disconnect();
      rail.removeEventListener('scroll', measure);
    };
  }, [atoms]);

  function browse(direction) {
    const rail = strip.current;
    rail?.scrollBy({ left: direction * rail.clientWidth });
  }

  return <div className="home-recommendations container">
    <section className="home-section" aria-labelledby="home-atoms-title">
      <header className="home-section-heading">
        <div><h2 id="home-atoms-title">从一门原子课程开始</h2><p>用一段专注的时间，掌握一个能立即用于创作的设计方法。</p></div>
        <div className="gallery-actions">
          {atoms.length > 0 && <>
            <button type="button" className="gallery-arrow" aria-label="向前浏览学习原子" disabled={!scroll.back} onClick={() => browse(-1)}><ArrowLeft size={18}/></button>
            <button type="button" className="gallery-arrow" aria-label="向后浏览学习原子" disabled={!scroll.forward} onClick={() => browse(1)}><ArrowRight size={18}/></button>
          </>}
          <MorphLink className="morph-text-link" href="/learning?library=atoms" onNavigate={onNavigate} aria-label="查看全部学习原子">查看全部 <ArrowUpRight size={16}/></MorphLink>
        </div>
      </header>
      {loadState === 'loading' && <p className="empty" role="status">正在加载学习原子…</p>}
      {loadState === 'error' && <div className="empty" role="status">学习原子加载失败。 <button type="button" className="button secondary" onClick={() => { setLoadState('loading'); setAttempt(value => value + 1); }}>重试</button></div>}
      {loadState === 'ready' && !atoms.length && <p className="empty">暂无已发布的教学原子</p>}
      {atoms.length > 0 && <div className="home-atom-strip" ref={strip} tabIndex={0} role="region" aria-label="推荐学习原子，横向滚动">
        {atoms.map(item => {
          const { action } = atomicCardState(item);
          return <article className="home-atom-card" key={`${item.id}@${item.revision}`}>
            <img className="home-atom-cover" src={atomicCover(item)} alt="" loading="lazy"/>
            <div className="home-atom-info">
              <span className="home-atom-meta">{[item.direction, item.minutes > 0 ? `${item.minutes} 分钟` : ''].filter(Boolean).join(' · ')}</span>
              <h3>{item.title}</h3>
              <p>{item.summary}</p>
              {(item.teacherName || item.author) && <small>{item.teacherName || item.author}</small>}
              <MorphLink className="button home-atom-action" href={withReturnTarget(atomicUrl(item.id, item.revision))} onNavigate={onNavigate} aria-label={`${action}：${item.title}`}>
                {action}<ArrowUpRight size={15}/>
              </MorphLink>
            </div>
          </article>;
        })}
      </div>}
    </section>
    <section className="home-section" aria-labelledby="home-cases-title">
      <header className="home-section-heading">
        <div><h2 id="home-cases-title">精彩案例</h2><p>从真实创作中发现灵感，把值得学习的方法带回你的下一次设计。</p></div>
        <MorphLink className="morph-text-link" href="/community" onNavigate={onNavigate} aria-label="查看全部案例">查看全部 <ArrowUpRight size={16}/></MorphLink>
      </header>
      {data.works.length > 0 ? <div className="morph-home-cases">{data.works.slice(0, 8).map(work => <MorphCaseCard key={work.id} work={work} onOpen={item => onNavigate(withReturnTarget('/community?work=' + encodeURIComponent(item.id)))}/>)}</div> : <p className="empty">暂无已发布案例</p>}
    </section>
  </div>;
}
