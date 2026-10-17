import { useEffect, useRef, useState } from 'react';
import { X } from '@phosphor-icons/react';
import { emptyToolDraft, readToolDraft, toolDraftKey, validateToolDraft } from './toolRecommendation.js';
import './handoff-details.css';

export function ToolRecommendationDialog({accountId,onClose,onNotice}) {
  const dialog=useRef(null),[draft,setDraft]=useState(()=>{try{return readToolDraft(window.localStorage,accountId);}catch{return emptyToolDraft();}}),[error,setError]=useState('');
  useEffect(()=>{
    const element=dialog.current,opener=document.activeElement,previous=document.body.style.overflow;
    element.showModal();document.body.style.overflow='hidden';
    return ()=>{element.close();document.body.style.overflow=previous;if(opener?.isConnected)opener.focus();};
  },[]);
  const submit=e=>{
    e.preventDefault();setError('');
    try {const clean=validateToolDraft(draft);window.localStorage.setItem(toolDraftKey(accountId),JSON.stringify(clean));onNotice('推荐草稿已保存在当前浏览器，尚未提交或发布。');onClose();}
    catch(e){setError(e.message||'无法保存，请检查浏览器存储设置。');}
  };
  return <dialog ref={dialog} className="dialog morph-tool-recommendation" aria-labelledby="tool-recommendation-title" onCancel={onClose} onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
    <button type="button" className="dialog-close" aria-label="关闭工具推荐" onClick={onClose} autoFocus><X size={18}/></button>
    <div className="dialog-content"><span className="eyebrow">TOOLS / 投稿草稿</span><h2 id="tool-recommendation-title">推荐一个工具</h2>
      <form onSubmit={submit}><label>工具名称<input required maxLength={80} value={draft.title} onChange={e=>setDraft({...draft,title:e.target.value})}/></label><label>官网链接<input required type="url" maxLength={2048} placeholder="https://" value={draft.url} onChange={e=>setDraft({...draft,url:e.target.value})}/></label><label>推荐理由<textarea required maxLength={2000} value={draft.reason} onChange={e=>setDraft({...draft,reason:e.target.value})}/></label>{error&&<p role="alert">{error}</p>}<button className="button" type="submit">保存推荐草稿</button><p className="quiet">保存推荐内容到当前浏览器，仅当前账号可见，尚未提交审核或公开发布。</p></form>
    </div>
  </dialog>;
}
