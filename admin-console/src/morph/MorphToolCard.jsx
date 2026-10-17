import { ArrowRight, ArrowUpRight, BookOpen, CaretDown, Compass, PencilSimple } from '@phosphor-icons/react';
import { useEffect, useId, useState } from 'react';
import { toolPresentation } from './morphPresentation.js';
import { toolCardMetadata } from './toolCardMetadata.js';
import './tool-cards.css';

/** Match the handoff card, without importing demo bookmarks, pricing or endorsements. */
export function MorphToolCard({ tool, icon, canManage, onEdit, onNavigate, onOpenWorkflowBuilder }) {
  const info = toolPresentation(tool);
  const metadata = toolCardMetadata(tool);
  const [showCourses, setShowCourses] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);
  const coursesId = useId();
  const titleId = useId();
  useEffect(() => setLogoFailed(false), [tool.coverImageUrl]);
  const related = tool.catalog?.relatedCourseIds || [];
  const launchClass = 'morph-tool-card__launch morph-tool-card__open';
  const launchText = `打开 ${info.name}`;
  const launchContent = <>{launchText}{info.internal ? <ArrowRight size={16}/> : <ArrowUpRight size={16}/>}</>;
  return <article className="morph-tool-card" aria-labelledby={titleId}>
    <div className="morph-tool-card__head"><span className="morph-tool-card__icon" aria-hidden="true">{tool.coverImageUrl && !logoFailed
      ? <img src={tool.coverImageUrl} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setLogoFailed(true)}/>
      : icon}</span><div className="morph-tool-card__title"><h2 id={titleId}>{info.name}{tool.featured && <small className="morph-tool-card__featured">推荐</small>}</h2><p>{metadata.subtitle || info.kind}</p></div></div>
    <span className={`morph-tool-card__category morph-tool-card__category--${metadata.tone}`}>{tool.category || info.kind}</span>
    <p className="morph-tool-card__description">{info.detail}</p>
    {metadata.tags.length > 0 && <div className="morph-tool-card__labels" aria-label="功能标签">{metadata.tags.map(tag => <span key={tag}>{tag}</span>)}</div>}
    <div className="morph-tool-card__meta"><span><Compass size={15}/>{tool.catalog?.stage || (info.internal ? '平台创作' : '创作探索')}</span><span className="morph-tool-card__destination">{info.kind}{info.newTab ? ' · 新标签页' : ''}</span>{metadata.unconfirmed && <span className="morph-tool-card__verification">访问验证待确认</span>}</div>
    {related.length > 0 && <div className="morph-tool-card__learning"><button type="button" aria-expanded={showCourses} aria-controls={coursesId} onClick={() => setShowCourses(value => !value)}><BookOpen size={16}/>相关课程 <span>{related.length}</span><CaretDown size={13}/></button><div id={coursesId} className="morph-tool-card__courses" hidden={!showCourses} aria-label={`${tool.name}相关课程`}>{related.map(id => <button type="button" key={id} onClick={() => onNavigate(`/learning?course=${encodeURIComponent(id)}`)}>{tool.catalog.relatedCourseTitles?.[id] || '查看相关课程'}<ArrowRight size={13}/></button>)}</div></div>}
    <div className="morph-tool-card__footer"><small>{info.host}</small>{info.workflow ? <button type="button" className={launchClass} aria-label="打开工作流管理与创建页面" onClick={onOpenWorkflowBuilder}>{launchContent}</button> : <a className={launchClass} href={tool.href} target={info.newTab ? '_blank' : undefined} rel={info.newTab ? 'noopener noreferrer' : undefined} referrerPolicy="no-referrer" aria-label={`${launchText}${info.newTab ? '（新标签页）' : ''}`} onClick={event => {
      if (info.internal && !info.newTab && onNavigate && !event.button && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) { event.preventDefault(); onNavigate(tool.href); }
    }}>{launchContent}</a>}</div>
    {canManage && <button className="morph-tool-card__edit" type="button" onClick={() => onEdit(tool)} aria-label={`编辑 ${tool.name}`}><PencilSimple size={16}/></button>}
  </article>;
}
