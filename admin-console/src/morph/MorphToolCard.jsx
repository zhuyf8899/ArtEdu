import { ArrowRight, BookOpen, BookmarkSimple, CaretDown, Compass, PencilSimple, X } from '@phosphor-icons/react';
import { useEffect, useId, useRef, useState } from 'react';
import { toolPresentation } from './morphPresentation.js';
import { toolCardMetadata } from './toolCardMetadata.js';
import { withReturnTarget } from '../resourceContext.js';
import './tool-cards.css';
import {isToolBookmarked,setToolBookmark} from './toolBookmarks.js';

/** Match the handoff card, without importing demo bookmarks, pricing or endorsements. */
export function MorphToolCard({ accountId, tool, icon, canManage, onEdit, onNavigate, onOpenWorkflowBuilder }) {
  const info = toolPresentation(tool);
  const metadata = toolCardMetadata(tool);
  const [showCourses, setShowCourses] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);
  const coursesId = useId();
  const detailId = useId();
  const dialog = useRef(null);
  const detailsTrigger = useRef(null);
  const [detailsOpen,setDetailsOpen]=useState(false);
  const [saved,setSaved]=useState(()=>isToolBookmarked(accountId,tool.id));
  const [saveError,setSaveError]=useState('');
  const toggleSaved=()=>{
    try { setToolBookmark(accountId,tool.id,!saved);setSaved(!saved);setSaveError(''); }
    catch { setSaveError('当前浏览器无法保存工具收藏。'); }
  };
  useEffect(()=>{
    if(!detailsOpen)return;
    dialog.current.showModal();
    return()=>detailsTrigger.current?.focus();
  },[detailsOpen]);
  const titleId = useId();
  useEffect(() => setLogoFailed(false), [tool.coverImageUrl]);
  const related = tool.catalog?.relatedCourseIds || [];
  const launchClass = 'morph-tool-card__launch morph-tool-card__open';
  const launchText = `打开 ${info.name}`;
  const launchContent = <>使用</>;
  return <article className="morph-tool-card" aria-labelledby={titleId}>
    <div className="morph-tool-card__head"><span className="morph-tool-card__icon" aria-hidden="true">{tool.coverImageUrl && !logoFailed
      ? <img src={tool.coverImageUrl} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setLogoFailed(true)}/>
      : icon}</span><div className="morph-tool-card__title"><h2 id={titleId}>{info.name}{['绘世 PaintPilot','数字影箱','Gemus'].includes(tool.name) && <small className="morph-tool-card__featured">自研</small>}</h2><p>{metadata.subtitle || info.kind}</p></div></div>
    <span className={`morph-tool-card__category morph-tool-card__category--${metadata.tone}`}>{tool.category || info.kind}</span>
    <p className="morph-tool-card__description">{info.detail}</p>
    {metadata.tags.length > 0 && <div className="morph-tool-card__labels" aria-label="功能标签">{metadata.tags.map(tag => <span key={tag}>{tag}</span>)}</div>}
    <div className="morph-tool-card__footer"><button type="button" ref={detailsTrigger} className="morph-tool-detail-trigger" onClick={()=>setDetailsOpen(true)}>工具详情</button>{info.workflow ? <button type="button" className={launchClass} aria-label="打开工作流管理与创建页面" onClick={onOpenWorkflowBuilder}>{launchContent}</button> : <a className={launchClass} href={tool.href} target={info.newTab ? '_blank' : undefined} rel={info.newTab ? 'noopener noreferrer' : undefined} referrerPolicy="no-referrer" aria-label={`${launchText}${info.newTab ? '（新标签页）' : ''}`} onClick={event => {
      if (info.internal && !info.newTab && onNavigate && !event.button && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) { event.preventDefault(); onNavigate(withReturnTarget(tool.href)); }
    }}>{launchContent}</a>}</div>
    {!canManage&&<button type="button" className="morph-tool-bookmark" aria-label={`${saved?'取消收藏':'收藏'} ${tool.name}`} aria-pressed={saved} title="收藏到当前浏览器" onClick={toggleSaved}><BookmarkSimple size={19} weight={saved?'fill':'regular'}/></button>}
    {saveError&&<p className="morph-tool-save-error" role="alert">{saveError}</p>}
    {detailsOpen&&<dialog className="morph-tool-detail" ref={dialog} aria-labelledby={detailId} onCancel={()=>setDetailsOpen(false)} onClick={event=>{if(event.target===dialog.current)setDetailsOpen(false);}}>
      <header><h2 id={detailId}>{info.name}</h2><button type="button" aria-label="关闭工具详情" onClick={()=>setDetailsOpen(false)}><X size={20}/></button></header>
      <p>{info.detail}</p>
      <p className="morph-tool-detail__host">{info.host}</p>
    <div className="morph-tool-card__meta"><span><Compass size={15}/>{tool.catalog?.stage || (info.internal ? '平台创作' : '创作探索')}</span><span className="morph-tool-card__destination">{info.kind}{info.newTab ? ' · 新标签页' : ''}</span>{metadata.unconfirmed && <span className="morph-tool-card__verification">访问验证待确认</span>}</div>
    {related.length > 0 && <div className="morph-tool-card__learning"><button type="button" aria-expanded={showCourses} aria-controls={coursesId} onClick={() => setShowCourses(value => !value)}><BookOpen size={16}/>相关课程 <span>{related.length}</span><CaretDown size={13}/></button><div id={coursesId} className="morph-tool-card__courses" hidden={!showCourses} aria-label={`${tool.name}相关课程`}>{related.map(id => <button type="button" key={id} onClick={() => onNavigate(withReturnTarget(`/learning?course=${encodeURIComponent(id)}`))}>{tool.catalog.relatedCourseTitles?.[id] || '查看相关课程'}<ArrowRight size={13}/></button>)}</div></div>}
    {(tool.catalog?.relatedAtoms?.length > 0 || tool.catalog?.relatedWorks?.length > 0) && <details className="morph-tool-card__connections"><summary>关联教学原子与案例 <small>{(tool.catalog.relatedAtoms?.length || 0) + (tool.catalog.relatedWorks?.length || 0)}</small></summary>
      {tool.catalog.relatedAtoms?.map(node => <button type="button" key={node.id} onClick={() => onNavigate(withReturnTarget('/learning?library=atoms&node=' + encodeURIComponent(node.id)))}>教学原子 · {node.title}<ArrowRight size={14}/></button>)}
      {tool.catalog.relatedWorks?.map(work => <button type="button" key={work.id} onClick={() => onNavigate(withReturnTarget('/community?work=' + encodeURIComponent(work.id)))}>应用案例 · {work.title}<ArrowRight size={14}/></button>)}
    </details>}
    </dialog>}
    {canManage && <button className="morph-tool-card__edit" type="button" onClick={() => onEdit(tool)} aria-label={`编辑 ${tool.name}`}><PencilSimple size={16}/></button>}
  </article>;
}
