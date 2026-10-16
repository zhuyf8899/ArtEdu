import { ArrowRight, ArrowUpRight, PencilSimple } from '@phosphor-icons/react';
import { toolPresentation } from './morphPresentation.js';

/** Metadata is derived only from the managed directory, never from static demo popularity/pricing. */
export function MorphToolCard({ tool, icon, canManage, onEdit, onNavigate, onOpenWorkflowBuilder }) {
  const info = toolPresentation(tool);
  const content = <>
    <div className="morph-tool-card__head"><span className="morph-tool-card__icon">{icon}</span><div><h2>{info.name}</h2><span className="morph-tool-card__kind">{info.kind}{info.newTab ? ' · 新标签页打开' : ''}</span></div>{tool.featured && <small className="morph-tool-card__featured">推荐</small>}</div>
    <p className="morph-tool-card__description">{info.detail}</p>
    <div className="morph-tool-card__labels">{tool.category && <span>{tool.category}</span>}</div>
    <div className="morph-tool-card__footer"><small>{info.host}</small><span className="morph-tool-card__open">{info.internal ? '进入工具' : '打开官网'}{info.internal ? <ArrowRight size={16}/> : <ArrowUpRight size={16}/>}</span></div>
  </>;
  return <article className="morph-tool-card">
    {info.workflow ? <button type="button" className="morph-tool-card__launch" aria-label="打开工作流管理与创建页面" onClick={onOpenWorkflowBuilder}>{content}</button> : <a className="morph-tool-card__launch" href={tool.href} target={info.newTab ? '_blank' : undefined} rel={info.newTab ? 'noopener noreferrer' : undefined} referrerPolicy="no-referrer" onClick={event => {
      if (info.internal && !info.newTab && onNavigate && !event.button && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) { event.preventDefault(); onNavigate(tool.href); }
    }}>{content}</a>}
    {canManage && <button className="morph-tool-card__edit" type="button" onClick={() => onEdit(tool)} aria-label={`编辑 ${tool.name}`}><PencilSimple size={16}/></button>}
  </article>;
}
