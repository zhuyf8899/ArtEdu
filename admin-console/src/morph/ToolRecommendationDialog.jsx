import { useEffect, useRef, useState } from 'react';
import { X } from '@phosphor-icons/react';
import { emptyToolDraft, readToolDraft, toolDraftKey, validateToolDraft } from './toolRecommendation.js';
import './handoff-details.css';
import { getToolRecommendations,submitToolRecommendation } from '../services/adminApi.js';

export function ToolRecommendationDialog({accountId,onClose,onNotice}) {
  const dialog=useRef(null),[draft,setDraft]=useState(()=>{try{return readToolDraft(window.localStorage,accountId);}catch{return emptyToolDraft();}}),[error,setError]=useState('');
  const [items,setItems]=useState([]),[sending,setSending]=useState(false);
  useEffect(()=>{let active=true;getToolRecommendations().then(data=>{if(active)setItems(data.items||[]);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[]);
  useEffect(()=>{
    const element=dialog.current,opener=document.activeElement,previous=document.body.style.overflow;
    element.showModal();document.body.style.overflow='hidden';
    return ()=>{element.close();document.body.style.overflow=previous;if(opener?.isConnected)opener.focus();};
  },[]);
  const submit=e=>{
    e.preventDefault();setError('');
    try {const clean=validateToolDraft(draft);window.localStorage.setItem(toolDraftKey(accountId),JSON.stringify(clean));onNotice('推荐草稿已保存在此浏览器。');onClose();}
    catch(e){setError(e.message||'无法保存，请检查浏览器存储设置。');}
  };
  const send=async()=>{if(sending)return;setError('');setSending(true);try{const clean=validateToolDraft(draft);await submitToolRecommendation(clean);setDraft(emptyToolDraft());try{window.localStorage.removeItem(toolDraftKey(accountId));}catch{}setItems((await getToolRecommendations()).items);onNotice('推荐已提交到平台审核，反馈会显示在这里。');}catch(e){setError(e.message);}finally{setSending(false);}};
  return <dialog ref={dialog} className="dialog morph-tool-recommendation" aria-labelledby="tool-recommendation-title" onCancel={onClose} onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
    <button type="button" className="dialog-close" aria-label="关闭工具推荐" onClick={onClose} autoFocus><X size={18}/></button>
    <div className="dialog-content"><span className="eyebrow">TOOLS / 投稿草稿</span><h2 id="tool-recommendation-title">推荐一个工具</h2>
      <form onSubmit={e=>{e.preventDefault();void send();}}><fieldset disabled={sending} className="atomic-edit-fields"><label>工具名称<input required minLength={2} maxLength={80} value={draft.title} onChange={e=>setDraft({...draft,title:e.target.value})}/></label><label>官网链接<input required type="url" maxLength={2048} placeholder="https://" value={draft.url} onChange={e=>setDraft({...draft,url:e.target.value})}/></label><label>推荐理由<textarea required minLength={5} maxLength={2000} value={draft.reason} onChange={e=>setDraft({...draft,reason:e.target.value})}/></label>{error&&<p role="alert">{error}</p>}<div className="audit-empty-actions"><button className="button" type="submit">{sending?'正在提交…':'提交平台审核'}</button><button className="button secondary" type="button" onClick={submit}>仅保存本机草稿</button></div></fieldset><p className="quiet">本机草稿保存在此浏览器，暂不公开。提交后跟随账号保存，管理员或运营审核；采纳后仍需管理员整理加入工具目录。</p></form>
      <section className="tool-recommendation-history"><h3>我的推荐与反馈</h3>{items.length?items.map(item=><article key={item.id}><strong>{item.title}</strong><span>{({pending:'等待审核',accepted:'已采纳，待整理目录',rejected:'未采纳'})[item.status]}</span>{item.feedback&&<p>{item.feedback}</p>}</article>):<p>尚无已提交的推荐。本机草稿不会进入审核队列。</p>}</section>
    </div>
  </dialog>;
}
