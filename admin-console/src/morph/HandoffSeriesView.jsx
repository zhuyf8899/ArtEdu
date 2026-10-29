import {returnContext} from '../resourceContext.js';
import {createElement,useEffect,useRef,useState} from 'react';
import template from './handoffSeriesTemplate.json';
import bundle from './handoffSeriesData.json';
import {atomicUrl} from '../atomicModel';
import './handoff-series-source.css';
import './handoff-series.css';
const aliases={'Data Diary':'数据日志','科学可视化设计与问答':'科学可视化'};
export const handoffSeriesId='morph-handoff-infographic-2026';
const course=bundle.nodes.find(n=>n.id===handoffSeriesId);
export const handoffSeriesAtoms=new Set(course.payload.steps.map(s=>s.atomId));
function nodeText(n){return typeof n==='string'?n:n.children.map(nodeText).join('');}
function SourceNode({node,onAction,onStudy}){
 if(typeof node==='string')return node;
 const props={...node.props};if(props['data-action'])props.onClick=()=>onAction(props['data-action']);
 if(node.tag==='input')props.onChange=e=>onAction('search',e.target.value);
 const children=node.children.map((n,i)=>typeof n==='string'?n:<SourceNode key={i} node={n} onAction={onAction} onStudy={onStudy}/>);
 if(node.tag==='details'&&props.className==='lesson-topic'){
  const titleBlock=findNode(node,n=>n.props?.['data-name']==='标题与讲授者');
  const title=titleBlock?nodeText(titleBlock.children[0]).trim():'';
  const atom=bundle.nodes.find(n=>n.payload.title===(aliases[title]||title));
  if(atom)children.push(<button type="button" className="series-study" key="study" onClick={()=>onStudy(atom.id)}>学习本原子 · 查看内容与记录 ↗</button>);
 }
 if(['input','img','br'].includes(node.tag))return createElement(node.tag,props);
 return createElement(node.tag,props,...children);
}
function findNode(n,fn){if(typeof n==='string')return null;if(fn(n))return n;for(const c of n.children){const found=findNode(c,fn);if(found)return found;}return null;}
export function HandoffSeriesView({onNavigate,children}){
 const root=useRef(null),dialog=useRef(null),[panel,setPanel]=useState(''),[expanded,setExpanded]=useState(false);
 useEffect(()=>{const el=root.current,roadmap=el.querySelector('.course-roadmap'),sessions=[...el.querySelectorAll('.lesson-session')];const original=sessions.map(s=>({y:parseFloat(s.style.top),height:s.offsetHeight})),height=parseFloat(roadmap.style.height);
 const arrange=()=>{if(innerWidth<=1000){roadmap.style.transform='';roadmap.style.marginBottom='';return;}let delta=0;sessions.forEach((s,i)=>{s.style.top=original[i].y+delta+'px';delta+=s.offsetHeight-original[i].height;});const h=Math.max(height,height+delta),scale=Math.min(1,el.querySelector('.series-content').clientWidth/1536);roadmap.style.height=h+'px';roadmap.style.transform=`scale(${scale})`;roadmap.style.marginBottom=-(h*(1-scale))+'px';};
 const observer=new ResizeObserver(arrange);observer.observe(el.querySelector('.series-content'));arrange();el.addEventListener('toggle',arrange,true);window.addEventListener('resize',arrange);return()=>{observer.disconnect();el.removeEventListener('toggle',arrange,true);window.removeEventListener('resize',arrange);};},[]);
 useEffect(()=>{if(panel){const previous=document.activeElement;dialog.current.showModal();return()=>{dialog.current?.close();previous?.isConnected&&previous.focus();};}},[panel]);
 const act=(action,value)=>{
  if(action==='search'){root.current.querySelectorAll('.lesson-session').forEach(s=>s.hidden=Boolean(value.trim())&&!s.textContent.toLowerCase().includes(value.trim().toLowerCase()));return;}
  if(action==='expand-all'){const next=!expanded;root.current.querySelectorAll('.lesson-topic,.lesson-point').forEach(d=>d.open=next);setExpanded(next);const b=root.current.querySelector('[data-action="expand-all"]');if(b)b.textContent=next?'收起全部':'展开全部';return;}
  setPanel(action==='schedule'?'教学安排':'教学团队');
 };
 const study=id=>onNavigate(atomicUrl(id,1)+'&fromCourse='+handoffSeriesId+'&fromRevision=1');
 const names=[...new Set(bundle.nodes.filter(n=>n.lecturer).flatMap(n=>n.lecturer.split('\n')).filter(Boolean))];
 const schedule=[...new Set(course.payload.steps.flatMap(s=>s.context.split('。')[0].split('；')))];
 return <section className="handoff-series" ref={root}><div className="figma-course-detail"><div className="series-return"><button onClick={()=>onNavigate(returnContext().to||'/learning?library=courses')}>← {returnContext().to?returnContext().label:'返回完整课程'}</button><a href="#series-learning-tools">我的学习路线 ↓</a></div><SourceNode node={template} onAction={act} onStudy={study}/><details id="series-learning-tools" className="series-learning-tools"><summary>我的学习路线与课程任务</summary>{children}</details></div>{panel&&<dialog ref={dialog} className="series-dialog" onCancel={()=>setPanel('')} aria-label={panel}><header><h2>{panel}</h2><button onClick={()=>setPanel('')} aria-label="关闭">×</button></header>{(panel==='教学安排'?schedule:names).map(x=><p key={x}>{x}</p>)}</dialog>}</section>;
}
