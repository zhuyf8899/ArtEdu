import {useEffect,useState} from 'react';
import {getToolRecommendations,decideToolRecommendation} from './services/adminApi.js';
export function ToolRecommendationReview({showToast}){
 const [items,setItems]=useState([]),[error,setError]=useState(''),[busy,setBusy]=useState(false),[feedback,setFeedback]=useState({});
 const load=async()=>{try{setItems((await getToolRecommendations(true)).items||[]);setError('');}catch(e){setError(e.message);}};
 useEffect(()=>{void load();},[]);
 const decide=async(item,status)=>{if(busy)return;setBusy(true);try{await decideToolRecommendation(item.id,{status,feedback:feedback[item.id]||''});await load();showToast('处理结果已同步给推荐者');}catch(e){showToast(e.message,'error');}finally{setBusy(false);}};
 return <section className="tool-recommendation-review"><h2>工具推荐审核</h2><p>提交者可在技能工具的推荐窗口查看反馈。采纳不自动创建外链，核验后请管理员加入工具目录。</p>{error&&<p role="alert">{error}<button onClick={load}>重新加载</button></p>}{!error&&!items.length&&<p>暂无工具推荐。</p>}{items.map(item=><article key={item.id}><header><h3>{item.title}</h3><span>{item.author} · {({pending:'待审核',accepted:'已采纳，待整理目录',rejected:'未采纳'})[item.status]}</span></header><a href={item.url} target="_blank" rel="noopener noreferrer">查看推荐官网 ↗</a><p>{item.reason}</p>{item.status==='pending'?<><label>审核反馈<textarea minLength={2} maxLength={1000} value={feedback[item.id]||''} onChange={e=>setFeedback({...feedback,[item.id]:e.target.value})}/></label><div className="audit-empty-actions"><button disabled={busy||!feedback[item.id]?.trim()} onClick={()=>decide(item,'accepted')}>采纳推荐</button><button disabled={busy||!feedback[item.id]?.trim()} onClick={()=>decide(item,'rejected')}>不采纳并说明原因</button></div></>:<p>反馈：{item.feedback}</p>}</article>)}</section>;
}
