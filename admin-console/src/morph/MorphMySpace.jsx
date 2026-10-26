import { AtomicPortrait as ProfessionalPortrait } from './AtomicPortrait.jsx';
import { useState } from 'react';
import { ArrowRight, ArrowClockwise, BookOpenText, BookmarkSimple, CalendarCheck, ChartPolar, Check, House, ImageSquare, NotePencil, Sparkle } from '@phosphor-icons/react';
import { MorphCourseCard } from './MorphCatalog.jsx';
import { CatalogControls } from './CatalogControls.jsx';
import { dailyQuotaLabel, creationModeDescription } from './morphPresentation.js';
import { isCollectedWork, spaceEvidence, spaceCourseForCard, spaceCourseStatus } from './mySpaceModel.js';
import './my-space.css';
import { withReturnTarget } from '../resourceContext.js';

const VIEWS=[['overview','空间总览',House],['portrait','我的专业画像',ChartPolar],['courses','我的课程',BookOpenText],['plan','学习计划',CalendarCheck],['notes','学习笔记',NotePencil],['works','我的作品',ImageSquare],['favorites','收藏案例',BookmarkSimple]];
const statusName=value=>({draft:'草稿',pending:'审核中',approved:'已发布',rejected:'待修改',archived:'已归档'}[value]||'作品记录');
const courseForCard=spaceCourseForCard;

export function MorphMySpace({account,data,creation,view,onView,onNavigate,loading,error,onRetry,children}) {
  const evidence=spaceEvidence(data), full=view==='overview';
  const name=data.profile?.id===account.id?data.profile.displayName:account.name;
  return <section className={`morph-space container ${full?'morph-space--overview':'morph-space--compact'}`} aria-label="我的空间">
    <header className="morph-space-profile">
      {full&&<div className="morph-space-cover"><img src="/morph-v17/assets/digital-organism-cover-v1.png" alt="艺术与智能主题的个人空间默认封面"/></div>}
      <div className="morph-space-identity"><div className="morph-space-avatar" aria-hidden="true">{name.slice(0,1)}</div>
        <div className="morph-space-name"><span>MY SPACE / 我的空间</span><h1>{name}</h1><p>{account.roleLabel} · 学习与创作空间</p>{full&&<p className="morph-space-bio">把学习、实践与作品，连接成自己的创作路径。</p>}
          {full&&<div className="morph-space-directions">{evidence.directions.map(value=><span key={value}>{value}</span>)}</div>}
        </div>
        <aside className="morph-space-quota"><span>生成额度 / 今日</span><strong>{dailyQuotaLabel(creation?.quota)}</strong><small>{creationModeDescription(creation)}</small><button type="button" disabled={loading} onClick={onRetry}><ArrowClockwise size={15}/>{loading?'正在同步…':'刷新学习记录'}</button></aside>
      </div>
      {full&&<div className="morph-space-statistics" aria-label="个人学习统计">
        {[[data.courses?.length||0,'已加入课程'],[data.summary?.completedLessons||0,'已完成课时'],[evidence.originals.length,'创作记录'],[data.notes?.length||0,'学习笔记']].map(([value,label])=><span key={label}><strong>{loading||error||label==='创作记录'&&data.workLoadError?'—':value}</strong>{label}</span>)}
      </div>}
    </header>
    <nav className="morph-space-tabs" aria-label="我的空间导航">{VIEWS.map(([id,label,Icon])=><button type="button" key={id} aria-pressed={view===id} aria-controls="morph-space-content" onClick={()=>onView(id)}><Icon size={18} weight={view===id?'fill':'regular'}/>{label}{id==='plan'&&data.tasks?.some(task=>task.status==='pending')&&<small>{data.tasks.filter(task=>task.status==='pending').length}</small>}</button>)}</nav>
    <div id="morph-space-content" className="morph-space-content" role="region" aria-label="我的空间内容" aria-busy={loading}>
      {loading?<div className="morph-space-empty" role="status"><ArrowClockwise size={26}/><h2>正在同步我的空间</h2><p>课程、笔记与创作记录即将就绪。</p></div>:error?<div className="morph-space-empty" role="alert"><h2>个人记录暂时无法加载</h2><p>{error}</p><button onClick={onRetry}>重新加载</button></div>:<>
        {view==='overview'&&<>
          <ProfessionalPortrait data={data} onNavigate={onNavigate} onView={onView} compact/>
          <section className="morph-space-section"><SpaceHeading eyebrow="CREATION DESK" title="最近创作与整理" action="全部记录" onAction={()=>onView('works')}/><WorkRecords items={(data.works||[]).slice(0,3)} error={data.workLoadError} onRetry={onRetry} onNavigate={onNavigate}/></section>
          <section className="morph-space-section"><SpaceHeading eyebrow="LEARNING PATH" title="我听的课" action="全部课程" onAction={()=>onView('courses')}/><CourseRecords courses={(data.courses||[]).slice(0,2)} onNavigate={onNavigate}/></section>
        </>}
        {view==='portrait'&&<ProfessionalPortrait data={data} onNavigate={onNavigate} onView={onView}/>}
        {view==='courses'&&<><section className="morph-space-section"><SpaceHeading eyebrow="ATOMIC LEARNING" title="我的原子学习" action="查看独立学习记录 ↗" onAction={()=>onNavigate('/learning?library=learning')}/><p>新原子的阅读、练习和已完成版本单独记录；下面保留原有课程进度。</p></section><SpaceCourses courses={data.courses||[]} onNavigate={onNavigate}/></>}
        {view==='works'&&<SpaceWorks data={data} onNavigate={onNavigate} onRetry={onRetry}/>}
        {view==='favorites'&&<><SpaceHeading eyebrow="COLLECTIONS" title="收藏案例"/><WorkRecords items={data.favorites||[]} favorite onNavigate={onNavigate}/></>}
        {['plan','notes'].includes(view)&&<div className="morph-space-manager">{children}</div>}
      </>}
    </div>
  </section>;
}

function SpaceHeading({eyebrow,title,action,onAction}) {return <header className="morph-space-heading"><div><span>{eyebrow}</span><h2>{title}</h2></div>{action&&<button type="button" onClick={onAction}>{action}<ArrowRight size={16}/></button>}</header>;}
function CourseRecords({courses,onNavigate}) {return courses.length?<div className="morph-space-course-grid">{courses.map(course=><MorphCourseCard key={course.id} course={courseForCard(course)} onOpen={id=>onNavigate(`/learning?course=${encodeURIComponent(id)}`)}/>)}</div>:<div className="morph-space-empty"><BookOpenText size={30}/><h3>还没有加入课程</h3><button onClick={()=>onNavigate('/learning')}>发现原子课程<ArrowRight size={16}/></button></div>;}
function SpaceCourses({courses,onNavigate}) {
  const [status,setStatus]=useState('all'),[query,setQuery]=useState('');
  const state=spaceCourseStatus;
  const visible=courses.filter(course=>(status==='all'||state(course)===status)&&[course.title,course.author,course.catalog?.authorLabel,course.creatorName].filter(Boolean).join(' ').toLowerCase().includes(query.trim().toLowerCase()));
  const filters=[['all','全部'],['new','未开始'],['progress','进行中'],['complete','已完成'],['archived','历史课程']];
  return <><SpaceHeading eyebrow="MY COURSES" title="我的课程" action="发现课程" onAction={()=>onNavigate('/learning')}/>{courses.some(c=>c.archived)&&<p className="course-history-note">已下架课程的学习记录保留在“历史课程”中。</p>}
    {courses.length>0&&<CatalogControls label="我的课程筛选" options={filters.map(([value,label])=>({value,label,count:courses.filter(c=>value==='all'||state(c)===value).length}))} value={status} onChange={setStatus} query={query} onQueryChange={setQuery} searchLabel="搜索我的课程" placeholder="搜索课程、授课作者" resultLabel={`${visible.length} / ${courses.length} 门课程`} selected={[query&&{label:query,onRemove:()=>setQuery('')},status!=='all'&&{label:filters.find(([value])=>value===status)?.[1],onRemove:()=>setStatus('all')}].filter(Boolean)} onClear={()=>{setQuery('');setStatus('all');}}/>}
    {!courses.length?<CourseRecords courses={[]} onNavigate={onNavigate}/>:visible.length?<CourseRecords courses={visible} onNavigate={onNavigate}/>:<div className="morph-space-empty"><h3>没有匹配的课程</h3><button onClick={()=>{setQuery('');setStatus('all');}}>清除筛选</button></div>}</>;
}
function WorkRecords({items,onNavigate,error,onRetry,favorite=false}) {
  if(error)return <div className="morph-space-empty" role="alert"><p>作品记录暂时无法加载：{error}</p><button onClick={onRetry}>重新加载作品</button></div>;
  return items.length?<div className="morph-space-work-grid">{items.map(work=><article key={work.id}><button type="button" className="morph-space-work-open" onClick={()=>onNavigate(withReturnTarget(`/community?work=${encodeURIComponent(work.id)}`))}>{work.previewUrl?<img src={work.previewUrl} alt={work.title} loading="lazy"/>:<div className="morph-space-work-empty"><ImageSquare size={32}/><span>暂无封面</span></div>}<div><small>{favorite?'已收藏案例':isCollectedWork(work)?'我整理的案例':statusName(work.status)}</small><h3>{work.title}</h3><p>{favorite?(work.creators?.length?`原作者：${work.creators.join('、')}`:'查看案例与原作者信息'):isCollectedWork(work)?`原作者：${work.creators?.join('、')||'查看案例署名'}`:work.discipline||'创作记录'}</p><span>查看记录<ArrowRight size={15}/></span></div></button></article>)}</div>:<div className="morph-space-empty"><ImageSquare size={30}/><h3>{favorite?'还没有收藏案例':'还没有相关作品记录'}</h3><button onClick={()=>onNavigate(favorite?'/community':'/create')}>{favorite?'浏览案例社区':'开始一次创作'}<ArrowRight size={16}/></button></div>;
}
function SpaceWorks({data,onNavigate,onRetry}) {
  const [kind,setKind]=useState('all');
  const items=(data.works||[]).filter(work=>kind==='all'||(kind==='collected'?isCollectedWork(work):!isCollectedWork(work)));
  return <><SpaceHeading eyebrow="MY CREATIONS" title="我的作品与案例" action="开始创作" onAction={()=>onNavigate('/create')}/><div className="morph-space-work-filters" role="group" aria-label="作品来源筛选">{[['all','全部记录'],['original','我的创作'],['collected','我整理的案例']].map(([id,label])=><button type="button" key={id} aria-pressed={kind===id} onClick={()=>setKind(id)}>{label}</button>)}</div><WorkRecords items={items} error={data.workLoadError} onRetry={onRetry} onNavigate={onNavigate}/></>;
}
