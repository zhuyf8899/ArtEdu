import { useEffect, useRef, useState } from 'react';
import { Asterisk, ArrowRight, MagnifyingGlass, SignOut, X } from '@phosphor-icons/react';
import { canEnterAdmin } from '../testAccounts.js';
import { mountMorphCosmos } from './cosmosEffect.js';
import { dailyQuotaLabel, creationModeDescription } from './morphPresentation.js';
import './source-platform.css';
import './source-dark-home.css';
import './source-account.css';
import './source-ui-system.css';
import './source-gallery.css';
import './source-curriculum.css';
import './integration.css';
import './catalog-controls.css';
import './handoff-details.css';
import './integration-polish.css';

const items = [['courses','原子课程','/learning'],['community','案例社区','/community'],['studio','技能工具','/studio'],['creation','创作空间','/create']];
export function MorphLink({ href, onNavigate, children, ...props }) {
  return <a {...props} href={href} onClick={e => { if(e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; e.preventDefault(); onNavigate(href); }}>{children}</a>;
}
export function MorphNav({ account, section, creation, onNavigate, onSwitchAccount, onEnterAdmin }) {
  const [open,setOpen] = useState(false), [query,setQuery] = useState('');
  const root = useRef(null), trigger = useRef(null);
  useEffect(() => {
    const click = e => { if(!root.current?.contains(e.target)) setOpen(false); };
    const key = e => { if(e.key === 'Escape' && open) { setOpen(false); trigger.current?.focus(); } };
    document.addEventListener('pointerdown',click); document.addEventListener('keydown',key);
    return () => { document.removeEventListener('pointerdown',click); document.removeEventListener('keydown',key); };
  },[open]);
  useEffect(() => { setOpen(false); },[section]);
  const remaining = dailyQuotaLabel(creation?.quota);
  return <nav className="site-nav morph-nav" aria-label="主导航">
    <div className="nav-left"><MorphLink className="brand" href="/" onNavigate={onNavigate}><Asterisk size={28} weight="bold" aria-hidden="true" /><span><strong>MORPH LAB</strong><small>AI + Design 实验室</small></span></MorphLink><div className="nav-links">{items.map(([id,label,href])=><MorphLink key={id} className={section===id?'active':''} aria-current={section===id?'page':undefined} href={href} onNavigate={onNavigate}>{label}</MorphLink>)}</div></div>
    <div className="morph-nav-right"><form className="morph-nav-search" onSubmit={e=>{e.preventDefault();if(query.trim())onNavigate('/search?query='+encodeURIComponent(query.trim()));}}><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="搜索课程、工具、案例" aria-label="全站搜索关键词" /><button aria-label="全站搜索" disabled={!query.trim()}><MagnifyingGlass size={17}/></button></form><div ref={root} className="morph-account"><button ref={trigger} type="button" className="account account-trigger" aria-label="打开我的空间菜单" aria-expanded={open} aria-controls="morph-account-panel" onClick={()=>setOpen(!open)}><span className="avatar">{account.shortName.slice(0,1)}</span><span className="account-name">{account.name}</span></button>{open&&<section className="account-dialog" id="morph-account-panel" aria-label="我的账户"><header className="account-panel-head"><h2>我的空间 · 个人信息</h2><button className="account-close" aria-label="关闭账户菜单" onClick={()=>{setOpen(false);trigger.current?.focus();}}><X size={16}/></button></header><section className="account-identity"><span className="avatar">{account.shortName.slice(0,1)}</span><div><strong>{account.name}</strong><p>{account.roleLabel}</p></div></section><section className="account-tokens"><h3>生成额度</h3><strong>{remaining}</strong><p>{creationModeDescription(creation)}</p></section><MorphLink className="account-space" href="/my-learning" onNavigate={onNavigate}><span><strong>进入我的空间</strong><small>专业画像 · 学习记录 · 我的作品</small></span><ArrowRight size={20}/></MorphLink>{canEnterAdmin(account)&&<button className="morph-account-action" onClick={onEnterAdmin}>进入管理后台 <ArrowRight size={17}/></button>}<button className="morph-account-action" onClick={onSwitchAccount}>退出登录 <SignOut size={17}/></button></section>}</div></div>
  </nav>;
}
export function MorphHero({ nav, children }) {
  const root = useRef(null);
  useEffect(()=>mountMorphCosmos(root.current),[]);
  return <section className="cosmos" id="explore" ref={root} aria-label="星空创意空间"><div className="mist" aria-hidden="true"/><div className="glow warm"><img src="/morph-v17/assets/dark-home/warm.svg" alt=""/></div><div className="glow cool"><img src="/morph-v17/assets/dark-home/cool.svg" alt=""/></div><canvas id="universe" aria-hidden="true"/><canvas id="word-dust" aria-hidden="true"/>{nav}<div className="eyebrow">DIGITAL EXPLORATION</div><div className="right-label">ART × AI × DESIGN</div><h1 id="hero-title"><span id="title-line-1">让创意生长于</span><br/><span id="title-line-2">艺术与智能之间</span></h1><p className="hero-description">探索案例、学习原子课程、调用技能工具，<br/>让每一次尝试成为新的创造。</p><button className="scene-hit" id="scene-next" type="button" aria-label="切换星云与眼睛形态"/><div className="floating-words" aria-hidden="true">{Array.from({length:9},(_,i)=><span key={i}/>)}</div>{children}</section>;
}
export function MorphFooter({onNavigate}) { return <footer className="footer unified-footer"><div className="container"><MorphLink className="footer-brand" href="/" onNavigate={onNavigate}><b>MORPH LAB</b><small>AI + Design 实验室</small></MorphLink><span>© 2026 MORPH LAB · ArtEdu</span></div></footer>; }
