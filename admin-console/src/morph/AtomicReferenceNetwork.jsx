import {createElement,useEffect,useRef,useState} from 'react';
import {ArrowUpRight,X} from '@phosphor-icons/react';
import networkTemplate from './atomicReferenceNetwork.json';
import {atomicRequest} from '../services/adminApi.js';
import {atomicUrl} from '../atomicModel.js';
import './atomic-reference-source.css';

// This is the supplied curriculum design, not a generated arrangement of today's
// records. Its original coordinates, artwork, curves and contributor captions are
// kept together. Published learning content is resolved separately on interaction.
function ReferenceElement({node,onSelect,onNavigate,root=false}){
 if(typeof node==='string')return node;
 const props={...node.props};
 if(root){props.role='region';props['aria-label']='学院课程知识网络';}
 if(node.tag==='button'||node.tag==='a'){
  const composer=props.href?.includes('mode=courses');
  const topic=props['data-network-topic']||props['data-name']||'课程知识网络';
  props.href=node.tag==='a'?(composer?'/curriculum':'/learning?library=atoms'):undefined;
  props.onClick=event=>{event.preventDefault();composer?onNavigate('/curriculum'):onSelect(topic);};
 }
 return createElement(node.tag,props,...node.children.map((child,index)=>typeof child==='string'?child:<ReferenceElement node={child} key={index} onSelect={onSelect} onNavigate={onNavigate}/>));
}
export function AtomicReferenceNetwork({accountId,serial,onNavigate}){
 const root=useRef(null),[topic,setTopic]=useState(''),[data,setData]=useState({items:[]}),[loading,setLoading]=useState(true),[error,setError]=useState(''),[attempt,setAttempt]=useState(0);
 useEffect(()=>{
  const wrapper=root.current,network=wrapper.querySelector('.knowledge-network'),graph=wrapper.querySelector('.knowledge-graph');
  // Original source's sizeGraph algorithm. Scaling the whole coordinate system
  // preserves its handoff composition instead of changing the node topology.
  const resize=()=>{const style=getComputedStyle(network),stacked=innerWidth<=1000,available=network.clientWidth-parseFloat(style.paddingLeft)*2-(stacked?0:parseFloat(style.gridTemplateColumns.split(' ')[0])+parseFloat(style.columnGap)),scale=Math.min(1,available/1204);graph.style.transform=`scale(${scale})`;graph.style.marginBottom=`${-500*(1-scale)}px`;if(!stacked)network.style.setProperty('height',Math.max(400,500*scale+50)+'px','important');else network.style.removeProperty('height');};
  const observer=new ResizeObserver(resize);observer.observe(network);resize();return()=>observer.disconnect();
 },[]);
 useEffect(()=>{let active=true;setLoading(true);setError('');atomicRequest('/network').then(result=>{if(active)setData(result);}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[accountId,serial,attempt]);
 return <div className="atomic-reference-scope" ref={root}><ReferenceElement node={networkTemplate} root onSelect={setTopic} onNavigate={onNavigate}/>{topic&&<ReferenceTopicDialog topic={topic} data={data} loading={loading} error={error} onRetry={()=>setAttempt(v=>v+1)} onClose={()=>setTopic('')} onNavigate={onNavigate}/>}</div>;
}
function ReferenceTopicDialog({topic,data,loading,error,onRetry,onClose,onNavigate}){
 const dialog=useRef(null),words=topic.replaceAll('\n','').split(/[、与\s/]+/).filter(word=>word.length>=2),matches=data.items.filter(item=>words.some(word=>(item.title||'').includes(word))),items=matches.length?matches:data.items.filter(item=>item.kind==='teaching').slice(0,6);
 useEffect(()=>{const previous=document.activeElement;dialog.current.showModal();return()=>{dialog.current?.close();previous?.isConnected&&previous.focus();};},[]);
 return <dialog className="particles-overview reference-topic-dialog" ref={dialog} aria-labelledby="reference-topic-title" onCancel={onClose}><header><span>课程知识网络 · 方向参考</span><button onClick={onClose} aria-label="关闭课程方向"><X size={21}/></button></header><h2 id="reference-topic-title">{topic}</h2><p>图中展示交接方案的课程结构。学习资源以平台已发布内容为准，规划节点不会写入个人学习进度。</p>{loading?<p role="status">正在查找可学习内容…</p>:error?<section role="alert"><p>{error}</p><button className="atomic-button secondary" onClick={onRetry}>重新加载</button></section>:<><h3>{matches.length?'按关键词找到的已发布内容':'当前可独立学习的原子'}</h3>{!matches.length&&<p>该方向尚未关联已发布资源，可先探索下列原子。</p>}<div className="reference-topic-results">{items.map(item=><button key={`${item.id}:${item.revision}`} onClick={()=>{onClose();onNavigate(atomicUrl(item.id,item.revision,item.kind==='course'?'courses':'atoms'));}}><span>{item.title}<small>{item.author} · v{item.revision}</small></span><ArrowUpRight size={17}/></button>)}</div>{!items.length&&<p>暂时没有已发布内容。</p>}</>}<footer><button className="atomic-button secondary" onClick={onClose}>返回课程网络</button><button className="atomic-button" onClick={()=>{onClose();onNavigate('/learning?library=courses');}}>查看完整课程<ArrowUpRight size={16}/></button></footer></dialog>;
}
