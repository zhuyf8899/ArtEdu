import {useEffect,useMemo,useState} from 'react';
import {ArrowClockwise,ArrowUpRight,MagnifyingGlass} from '@phosphor-icons/react';
import {getCourses,atomicRequest} from '../services/adminApi.js';
import {withReturnTarget} from '../resourceContext.js';
import {useScopedViewState} from '../useScopedViewState.js';
import {atomicUrl} from '../atomicModel.js';
import {MorphCourseCard} from './MorphCatalog.jsx';
import {AtomicParticleCard} from './AtomicParticles.jsx';
import {courseResources,filterCourseResources} from './learningCatalogModel.js';

export function UnifiedCourseCatalog({accountId,onNavigate,serial=0}){
 const [data,setData]=useState({legacy:[],assembled:[]}),[loading,setLoading]=useState(true),[error,setError]=useState(''),[attempt,setAttempt]=useState(0);
 const [availability,setAvailability]=useScopedViewState(accountId+':unified-courses:availability','available');
 const [direction,setDirection]=useScopedViewState(accountId+':unified-courses:direction','');
 const [query,setQuery]=useScopedViewState(accountId+':unified-courses:query','');
 const [stage,setStage]=useScopedViewState(accountId+':unified-courses:stage','');
 useEffect(()=>{let active=true;setLoading(true);setError('');
  const assembled=async()=>{const items=[];let page=1,total;do{const result=await atomicRequest('/catalog?view=courses&page='+page++);items.push(...result.items);total=result.total;}while(items.length<total&&page<=100);return items;};
  Promise.all([getCourses(),assembled()]).then(([legacy,items])=>{if(active)setData({legacy:legacy.items||[],assembled:items});}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};
 },[accountId,serial,attempt]);
 const resources=useMemo(()=>courseResources(data.legacy,data.assembled),[data]);
 const {items,facets,total}=filterCourseResources(resources,{availability,query,direction,stage});
 const open=resource=>onNavigate(withReturnTarget(resource.type==='legacy'?'/learning?course='+encodeURIComponent(resource.item.id):atomicUrl(resource.item.id,resource.item.revision,'courses')));
 const reset=()=>{setQuery('');setDirection('');setStage('');};
 return <section className="unified-course-catalog" aria-label="完整课程目录">
  <header className="learning-catalog-heading"><div><h2>选择一条完整的学习路线</h2><p>从试学课程到原子组合课程，按自己的节奏开始。</p></div><button className="atomic-button secondary" onClick={()=>onNavigate('/curriculum')}>组合学习路线<ArrowUpRight size={16}/></button></header>
  <div className="learning-availability" role="group" aria-label="课程开放状态">{[['available','可学习'],['planned','筹备中'],['all','全部课程']].map(([value,label])=><button key={value} type="button" aria-pressed={availability===value} onClick={()=>{setAvailability(value);setDirection('');}}>{label}<small>{resources.filter(r=>value==='all'||(value==='planned'?r.planned:!r.planned)).length} 门</small></button>)}</div>
  <div className="learning-discovery"><div className="particles-directions" role="group" aria-label="完整课程分类">{['',...Object.keys(facets)].map(value=><button type="button" key={value} aria-pressed={direction===value} onClick={()=>setDirection(value)}>{value||'全部方向'}<small>{value?facets[value]:total}</small></button>)}</div><label className="learning-search"><MagnifyingGlass size={18}/><input type="search" aria-label="搜索完整课程" placeholder="搜索课程、学习方向" maxLength={100} value={query} onChange={e=>setQuery(e.target.value)}/></label></div>
  <div className="learning-results-line"><span role="status">{loading?'正在同步课程…':`${items.length} 门课程`}</span><label>学习状态<select aria-label="课程学习状态" value={stage} onChange={e=>setStage(e.target.value)}><option value="">全部状态</option><option value="not_started">未开始</option><option value="in_progress">学习中</option><option value="completed">已完成</option></select></label>{(query||direction||stage)&&<button onClick={reset}>清除筛选</button>}<button className="learning-refresh" disabled={loading} onClick={()=>setAttempt(n=>n+1)} aria-label="刷新完整课程"><ArrowClockwise size={17}/></button></div>
  {error?<div className="learning-catalog-error" role="alert"><p>课程暂时无法同步：{error}</p><button className="atomic-button secondary" onClick={()=>setAttempt(n=>n+1)}>重新加载</button></div>:!loading&&!items.length?<div className="atomic-empty"><h3>没有匹配的课程</h3><p>试试其他关键词或方向。</p><button className="atomic-button secondary" onClick={reset}>清除筛选</button></div>:<div className="unified-learning-grid">{items.map(resource=><div className="learning-course-resource" key={resource.key} data-resource-type={resource.type}>{resource.type==='legacy'?<><span className="learning-resource-label">{resource.label}</span><MorphCourseCard course={resource.item} onOpen={()=>open(resource)}/></>:<AtomicParticleCard accountId={accountId} item={resource.item} onOpen={()=>open(resource)}/>}</div>)}</div>}
  <p className="learning-catalog-footnote">知识大纲提供阅读资料；试学课程包含现有课时与练习。两类内容分别保留学习记录。</p>
 </section>;
}
