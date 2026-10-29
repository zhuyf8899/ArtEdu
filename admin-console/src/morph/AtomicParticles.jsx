import {useEffect,useRef,useState} from 'react';
import {ArrowUpRight,ArrowRight,BookmarkSimple,DotsThree,X} from '@phosphor-icons/react';
import {atomicKinds,atomicUrl} from '../atomicModel.js';
import {atomicCardState,atomicCover,atomicDirections} from './atomicParticlesModel.js';
import {mountNetwork} from './networkEffect.js';
import {AtomicReferenceNetwork as AtomicCourseNetwork} from './AtomicReferenceNetwork.jsx';
import {atomicContentLabel} from './learningCatalogModel.js';
import './atomic-particles.css';
import './learning-catalog.css';

export function LearningNavigation({view,navItems,onNavigate,onCreate,teacher,reviewer,busy=false}){
 const root=useRef(null),trigger=useRef(null),[open,setOpen]=useState(false);
 useEffect(()=>{const close=e=>{if(!root.current?.contains(e.target))setOpen(false);};document.addEventListener('pointerdown',close);return()=>document.removeEventListener('pointerdown',close);},[]);
 const run=action=>{setOpen(false);action();};
 const management=navItems.filter(([key])=>!['legacy','atoms','courses'].includes(key));
 return <div className="learning-navigation"><nav aria-label="学习内容类型">{[['courses','完整课程'],['atoms','学习原子']].map(([key,label])=><button key={key} type="button" className={view===key||key==='courses'&&view==='legacy'?'is-active':''} aria-current={view===key||key==='courses'&&view==='legacy'?'page':undefined} onClick={()=>onNavigate('/learning?library='+key)}>{label}</button>)}</nav><div className="learning-navigation-actions"><button type="button" onClick={()=>onNavigate('/my-learning?view=courses')}>我的学习<ArrowUpRight size={15}/></button><div className="particles-workspace-menu" ref={root} onKeyDown={e=>{if(e.key==='Escape'){setOpen(false);trigger.current?.focus();}}}><button ref={trigger} type="button" className="learning-manage-trigger" aria-label="学习与管理" aria-expanded={open} onClick={()=>setOpen(v=>!v)}>{teacher||reviewer?'教学与管理':'我的贡献'}<DotsThree size={20}/></button>{open&&<section className="particles-menu-panel"><header>学习与管理</header><nav aria-label="学习管理选项">{management.map(([key,label])=><button key={key} onClick={()=>run(()=>onNavigate('/learning?library='+key))}>{label}</button>)}</nav><div className="particles-menu-actions"><button disabled={busy} onClick={()=>run(()=>onCreate('reflection'))}>上传心得</button>{teacher&&<><button disabled={busy} onClick={()=>run(()=>onCreate('teaching'))}>新建教学原子</button><button disabled={busy} onClick={()=>run(()=>onCreate('course'))}>编排完整课程</button></>}</div></section>}</div></div></div>;
}
export function LearningNetworkPanel({accountId,serial,onNavigate}){
 const [expanded,setExpanded]=useState(false);
 return <section className={'learning-network-panel'+(expanded?' is-expanded':'')} aria-label="课程知识网络"><header><div><span>CONNECTED LEARNING</span><h2>知识相连，学习有路</h2><p>探索课程结构，找到适合自己的学习方向。</p></div><button type="button" aria-expanded={expanded} aria-controls="learning-network-content" onClick={()=>setExpanded(v=>!v)}>{expanded?'收起课程网络':'展开课程网络'}<ArrowUpRight size={17}/></button></header><div id="learning-network-content" hidden={!expanded}>{expanded&&<AtomicCourseNetwork accountId={accountId} serial={serial} onNavigate={onNavigate}/>}</div></section>;
}

export function AtomicCatalogTools({direction,facets,onDirection,query,onQuery,stage,onStage,navItems,onNavigate,onRefresh,onCreate,teacher,busy}){
 return <><div className="particles-filterbar particles-filterbar--strict"><AtomicDirectionFilters direction={direction} facets={facets} onChange={onDirection}/><div className="particles-reference-search"><input type="search" aria-label="搜索学习原子" placeholder="搜索原子、知识或学习目标" maxLength={100} value={query} onChange={e=>onQuery(e.target.value)}/></div></div><div className="learning-results-line"><span>独立学习，也可连接为课程</span><label>学习状态<select aria-label="筛选学习状态" value={stage} onChange={e=>onStage(e.target.value)}><option value="">全部状态</option><option value="not_started">未开始</option><option value="in_progress">学习中</option><option value="completed">已完成</option></select></label><button disabled={busy} onClick={onRefresh}>刷新列表</button></div></>;
}

export function AtomicParticlesHeader({compact=false}){
 const root=useRef(null);
 useEffect(()=>mountNetwork(root.current),[]);
 return <header ref={root} className={`page-banner particles-banner${compact?' is-compact':''}`}><div className="container banner-copy"><div className="eyebrow">ATOMIC COURSES</div><h1>原子课程</h1><p className="learning-banner-subtitle">从一个知识点开始，连接成自己的课程。</p></div><div className="banner-art" id="effect-stage"><canvas id="effect-canvas" aria-hidden="true"/></div></header>;
}
export {AtomicCourseNetwork};
export function AtomicDirectionFilters({direction,facets,onChange}){
 const total=Object.values(facets).reduce((sum,n)=>sum+Number(n),0);
 return <div className="particles-directions" role="group" aria-label="课程分类">{['',...new Set([...atomicDirections.filter(d=>facets[d]>0),...Object.keys(facets)])].map(value=><button type="button" key={value} aria-pressed={direction===value} onClick={()=>onChange(value)}>{value||'全部'}<small>{value?facets[value]||0:total}</small></button>)}</div>;
}
export function AtomicParticleCard({item,onOpen,accountId=''}){
 const [overview,setOverview]=useState(false),state=atomicCardState(item),key='artedu:atomic-bookmark:'+accountId+':'+item.id;
 const [saved,setSaved]=useState(()=>{try{return localStorage.getItem(key)==='1';}catch{return false;}});
 const [saveError,setSaveError]=useState('');
 const bookmark=()=>{try{const next=!saved;next?localStorage.setItem(key,'1'):localStorage.removeItem(key);setSaved(next);setSaveError('');}catch{setSaveError('当前浏览器无法保存收藏。');}};
 return <article className="particle-course-card" data-learning-state={state.tone}><div className="particle-course-cover"><img src={atomicCover(item)} alt="" loading="lazy"/><span className={'particle-state '+state.tone}>{state.label}</span><small>{atomicKinds[item.kind]} · v{item.revision}</small></div><div className="particle-course-info"><span className="particle-classification"><span className="learning-content-badge">{atomicContentLabel(item)}</span>{item.direction||'跨专业'}</span><h3><button onClick={onOpen}>{item.title}</button></h3><p>{item.summary}</p><div className="particle-contributor"><span aria-hidden="true">{item.author?.slice(0,1)||'作'}</span><span>{item.author||'作者待确认'}</span>{item.assetCount>0&&<small>{item.assetCount} 个附件</small>}</div><div className="particle-card-bottom"><progress aria-label={item.title+'学习进度'} value={state.percent} max="100"/><p><span>{item.kind==='course'?`${item.completed||0} / ${item.required||0} 个必修原子`:`耗时 ${item.minutes||0} 分钟`}{' · '}{item.status==='published'?(item.kind==='course'?`${state.percent}%`:state.label):state.label}</span></p><div className="particle-card-actions"><button className="atomic-button secondary" onClick={()=>setOverview(true)}>查看详情</button><button className="atomic-button" onClick={onOpen}>{state.action}<ArrowUpRight size={15}/></button></div></div></div>{item.status==='published'&&<button className="particle-bookmark" aria-label={`${saved?'取消收藏':'收藏'} ${item.title}`} aria-pressed={saved} title="仅保存在当前浏览器，按账号区分" onClick={bookmark}><BookmarkSimple size={20} weight={saved?'fill':'regular'}/></button>}{saveError&&<p className="particle-bookmark-error" role="alert">{saveError}</p>}{overview&&<AtomicOverview item={item} state={state} onClose={()=>setOverview(false)} onOpen={onOpen}/>}</article>;
}
function AtomicOverview({item,state,onClose,onOpen}){
 const dialog=useRef(null);
 useEffect(()=>{const previous=document.activeElement;dialog.current.showModal();return()=>{dialog.current?.close();previous?.isConnected&&previous.focus();};},[]);
 return <dialog ref={dialog} className="particles-overview" aria-labelledby={'overview-'+item.id} onCancel={onClose} onClick={e=>{if(e.target===dialog.current)onClose();}}><header><span>{atomicKinds[item.kind]} · v{item.revision}</span><button aria-label="关闭课程详情" onClick={onClose}><X size={21}/></button></header><h2 id={'overview-'+item.id}>{item.title}</h2><p>{item.summary}</p><p className="learning-content-note">{atomicContentLabel(item)}{item.id?.startsWith('morph-handoff-')?' · 当前提供知识大纲阅读，完成记录不代表课堂学时或教师能力认证。':' · 学习记录与所引用版本关联保存。'}</p><dl><div><dt>贡献者</dt><dd>{item.author}</dd></div><div><dt>学习状态</dt><dd>{state.label}</dd></div><div><dt>{item.kind==='course'?'必修原子':'预计用时'}</dt><dd>{item.kind==='course'?`${item.completed} / ${item.required}`:`${item.minutes} 分钟`}</dd></div></dl><div className="particle-knowledge">{(item.knowledge||[]).map(k=><span key={k}>{k}</span>)}</div>{item.parentTitle&&<p>关联原子：{item.parentTitle}</p>}<footer><button className="atomic-button secondary" onClick={onClose}>继续浏览</button><button className="atomic-button" onClick={()=>{onClose();onOpen();}}>{state.action}<ArrowRight size={16}/></button></footer></dialog>;
}
