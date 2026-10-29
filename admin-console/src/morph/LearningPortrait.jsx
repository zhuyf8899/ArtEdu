import {useEffect,useRef,useState} from 'react';
import {ArrowClockwise,ArrowUpRight,CheckCircle,Clock,BookOpenText} from '@phosphor-icons/react';
import {createLearningTask,atomicRequest} from '../services/adminApi.js';
import {atomicUrl,learningStage} from '../atomicModel.js';
import {withReturnTarget} from '../resourceContext.js';
import {buildPortrait,portraitAtoms,portraitRecommendation,isVerifiedPractice,portraitKey} from './atomicPortraitModel.js';
import {PortraitRadar} from './PortraitRadar.jsx';
import './atomic-portrait.css';

async function allCourses(){
 const items=[];let page=1,total=0;
 do{const r=await atomicRequest('/catalog?view=courses&page='+page++);if(!r.items?.length&&items.length<r.total)throw Error('课程目录未完整返回，请重试');items.push(...(r.items||[]));total=r.total||0;}while(items.length<total);
 return items;
}
const blank={owner:'',rows:[],evidence:[],courses:[],warning:''};
export function LearningPortrait({onNavigate,compact=false,data={},accountId=data.profile?.id||'',onTaskSaved}){
 const [snapshot,setSnapshot]=useState(blank),[loading,setLoading]=useState(true),[error,setError]=useState(''),[reload,setReload]=useState(0);
 const [source,setSource]=useState('auto'),[direction,setDirection]=useState(''),[days,setDays]=useState(0),[mode,setMode]=useState('coverage'),[showAll,setShowAll]=useState(false);
 const [routeState,setRouteState]=useState({key:'',route:null,rows:[],error:'',loading:false}),[notice,setNotice]=useState(''),[saving,setSaving]=useState(false),[savedPlans,setSavedPlans]=useState([]);
 const planLock=useRef(false),planToken=useRef(0);
 useEffect(()=>{planToken.current++;planLock.current=false;setSaving(false);setSource('auto');setDirection('');setSavedPlans([]);setNotice('');setMode('coverage');setDays(0);setShowAll(false);},[accountId]);
 useEffect(()=>{let active=true;setLoading(true);setError('');
  Promise.allSettled([atomicRequest('/portrait'),atomicRequest('/abilities'),allCourses()]).then(results=>{
   if(!active)return;const [portrait,abilities,courses]=results;
   const denied=results.find(r=>r.status==='rejected'&&[401,403].includes(r.reason?.status));if(denied)throw denied.reason;
   if(portrait.status==='rejected')throw portrait.reason;
   setSnapshot({owner:accountId,rows:portrait.value.items||[],evidence:abilities.status==='fulfilled'?abilities.value.evidence||[]:[],courses:courses.status==='fulfilled'?courses.value:[],warning:[abilities.status==='rejected'&&'实践评价暂未同步，已保留阅读与完成记录。',courses.status==='rejected'&&'课程路线暂未同步，可先查看已有学习记录。'].filter(Boolean).join(' ')});
  }).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};
 },[accountId,reload]);
 useEffect(()=>{const sync=()=>{if(document.visibilityState==='visible'&&!planLock.current)setReload(n=>n+1);};window.addEventListener('focus',sync);document.addEventListener('visibilitychange',sync);return()=>{window.removeEventListener('focus',sync);document.removeEventListener('visibilitychange',sync);};},[]);
 const current=snapshot.owner===accountId?snapshot:blank;
 const course=current.courses.find(c=>`route:${c.id}@${c.revision}`===source);
 useEffect(()=>{if(!course){setRouteState({key:'',route:null,rows:[],error:'',loading:false});return;}let active=true;const key=source;
  setRouteState({key,route:null,rows:[],error:'',loading:true});
  (async()=>{const route=await atomicRequest(`/nodes/${encodeURIComponent(course.id)}?revision=${course.revision}`);
   const known=new Set(current.rows.map(portraitKey));const missing=(route.payload?.steps||[]).filter(s=>!known.has(`${s.atomId}@${s.revision}`));const rows=[];
   for(let i=0;i<missing.length;i+=4){const details=await Promise.all(missing.slice(i,i+4).map(s=>atomicRequest(`/nodes/${encodeURIComponent(s.atomId)}?revision=${s.revision}`)));for(const d of details)rows.push({id:d.id,revision:d.revision,publishedRevision:d.publishedRevision,payload:d.payload,stage:d.progress?.stage,feedback:d.progress?.feedback,updatedAt:d.progress?.updatedAt});}
   if(active)setRouteState({key,route,rows,error:'',loading:false});
  })().catch(e=>{if(active)setRouteState({key,route:null,rows:[],error:e.message,loading:false});});return()=>{active=false;};
 },[source,course?.id,course?.revision,current.rows]);
 const resolved=source==='auto'?(current.rows.some(a=>a.stage)?'records':data.courses?.length?'legacy':'records'):course?'route':source==='legacy'?'legacy':'records';
 const metric=resolved==='legacy'||current.warning.includes('实践评价')?'coverage':mode,route=routeState.key===source?routeState.route:null;
 const profile=buildPortrait({rows:[...current.rows,...(routeState.key===source?routeState.rows:[])],evidence:current.evidence,legacyCourses:data.courses||[],source:resolved,route,days,mode:metric});
 const selected=profile.axes.find(a=>a.direction===direction);
 const recommendation=portraitRecommendation({profile,source:resolved,route,direction,legacyCourses:data.courses||[],courses:current.courses});
 const targetUrl=rec=>rec.kind==='legacy'?'/learning?course='+encodeURIComponent(rec.item.id):atomicUrl(rec.item.id,rec.item.revision,rec.kind==='course'?'courses':'atoms');
 const taskFor=rec=>({taskType:rec.kind==='legacy'?'course':'atom',targetId:rec.item.id,...(rec.kind!=='legacy'?{targetRevision:rec.item.revision}:{})});
 const canPlan=recommendation&&recommendation.kind!=='course'&&!recommendation.waiting;
 const planned=canPlan&&(savedPlans.includes(portraitKey(recommendation.item))||(data.tasks||[]).some(t=>t.status==='pending'&&t.targetId===recommendation.item.id&&t.taskType===taskFor(recommendation).taskType&&(!t.targetRevision||t.targetRevision===recommendation.item.revision)));
 async function plan(){if(!canPlan||planned||planLock.current)return;planLock.current=true;const token=++planToken.current;setSaving(true);setNotice('');try{const task=await createLearningTask({title:'继续学习：'+recommendation.item.title,...taskFor(recommendation)});if(token!==planToken.current)return;onTaskSaved?.(task);setSavedPlans(v=>[...v,portraitKey(recommendation.item)]);setNotice('已加入学习计划，可以在“我的空间 → 学习计划”查看。');}catch(e){if(token===planToken.current)setNotice('添加计划失败：'+e.message);}finally{if(token===planToken.current){planLock.current=false;setSaving(false);}}}
 const atomTarget=new URLSearchParams(window.location.search).get('atom');
 useEffect(()=>{if(atomTarget){const atom=portraitAtoms(current.rows).find(a=>a.id===atomTarget);if(atom)setDirection(atom.direction);}},[atomTarget,current.rows]);
 const units=resolved==='legacy'?'课时':'原子';
 const visible=resolved==='legacy'?profile.scope.filter(c=>!direction||c.category===direction):profile.scope.filter(a=>(!direction||a.direction===direction)&&(showAll||a.stage));
 const scopeLabel=resolved==='legacy'?'原有课程课时完成度':resolved==='route'?'所选路线必修原子完成覆盖':'已开始原子的完成覆盖';
 const routeBusy=resolved==='route'&&(routeState.key!==source||routeState.loading);
 const navigate=to=>onNavigate(withReturnTarget(to));
 return <section className={'morph-space-section atomic-portrait'+(compact?' portrait-compact':'')} aria-label="我的专业画像">
  <header className="morph-space-heading"><div><span>PROFESSIONAL PORTRAIT</span><h2>我的专业画像</h2><p>看见学习的积累，也找到下一步的方向。</p></div><div className="portrait-header-actions"><button disabled={loading} onClick={()=>setReload(n=>n+1)} aria-label="刷新画像"><ArrowClockwise size={17}/></button><button onClick={()=>onNavigate(compact?'/my-learning?view=portrait':'/learning?library=atoms')}>{compact?'查看完整画像':'探索学习原子'}<ArrowUpRight size={16}/></button></div></header>
  {loading?<div className="portrait-load" role="status">正在同步真实学习记录…</div>:error?<div className="portrait-load" role="alert"><p>画像暂时无法加载：{error}</p><button onClick={()=>setReload(n=>n+1)}>重新加载</button></div>:<>
   <div className="portrait-controls"><label>查看范围<select aria-label="画像查看范围" value={source==='auto'?resolved:source} onChange={e=>{setSource(e.target.value);setDirection('');setShowAll(false);}}><option value="records">我的原子学习记录</option>{data.courses?.length>0&&<option value="legacy">原有课程记录</option>}{current.courses.map(c=><option key={c.id+'@'+c.revision} value={`route:${c.id}@${c.revision}`}>{c.title} · v{c.revision}</option>)}</select></label><label>记录时间<select aria-label="画像记录时间" value={days} onChange={e=>setDays(Number(e.target.value))}><option value="0">全部记录</option><option value="30">近 30 天更新</option><option value="7">近 7 天更新</option></select></label>{direction&&<button onClick={()=>setDirection('')}>查看全部方向</button>}</div>
   {current.warning&&<p className="portrait-warning" role="status">{current.warning}</p>}{routeState.key===source&&routeState.error&&<p className="portrait-warning" role="alert">路线暂时无法读取：{routeState.error}<button onClick={()=>setReload(n=>n+1)}>重新同步</button></p>}
   <div className="portrait-summary-grid"><div className="portrait-radar-panel"><header><div><span>LEARNING RADAR</span><h3>{metric==='practice'?'实践验证':'学习覆盖'}</h3></div><span className="portrait-coverage-chip">已涉及 {profile.covered} 个方向</span></header><div className="portrait-metric-tabs" role="group" aria-label="画像数据类型"><button aria-pressed={metric==='coverage'} onClick={()=>setMode('coverage')}>学习覆盖</button><button disabled={resolved==='legacy'||current.warning.includes('实践评价')} title={resolved==='legacy'?'旧课程记录只展示课时进度，不转换为能力评价。':undefined} aria-pressed={metric==='practice'} onClick={()=>setMode('practice')}>实践验证</button></div>
    {routeBusy?<div className="portrait-chart-loading" role="status">正在读取路线的固定版本…</div>:<PortraitRadar axes={profile.axes} selected={direction} onSelect={setDirection} mode={metric} compact={compact}/>}
    <footer><strong>{scopeLabel}</strong><p>{metric==='practice'?'比例 = 有教师评价记录的通过练习 / 当前范围内的练习原子。':resolved==='legacy'?'比例 = 已完成课时 / 已加入课程的课时总数。':'比例 = 已完成原子 / 当前查看范围内的原子总数。'}</p><p>“暂无证据”表示尚无对应记录，不代表能力低。点击方向可查看依据。</p>{resolved==='records'&&<p>仅统计已开始的原子；新增目录内容不会改变此范围。</p>}{resolved==='route'&&<p>按固定版本统计必修原子；独立课程任务请在课程页查看。</p>}{days>0&&<p>时间筛选按记录最近更新时间计算。</p>}{profile.missing>0&&<p>部分版本资料尚未同步，暂不计算覆盖比例。</p>}</footer>
   </div><aside className="portrait-side-panel"><section className="portrait-next-card"><span>NEXT STEP</span><h3>下一步学习</h3>{recommendation?<><strong>{recommendation.title}</strong><h4>{recommendation.item.title}</h4><p>{recommendation.reason}</p>{recommendation.item.minutes>0&&<small><Clock size={14}/>预计 {recommendation.item.minutes} 分钟</small>}<div className="portrait-next-actions"><button onClick={()=>navigate(targetUrl(recommendation))}>{recommendation.waiting?'查看提交记录':recommendation.kind==='course'?'进入课程':'继续学习'}<ArrowUpRight size={16}/></button>{canPlan&&<button className="secondary" disabled={saving||planned} onClick={plan}>{saving?'正在添加…':planned?'已加入计划':'加入学习计划'}</button>}</div></>:<><p>当前范围没有待继续的内容，可以回顾记录或探索其他方向。</p><button onClick={()=>onNavigate('/learning?library=courses')}>浏览完整课程<ArrowUpRight size={16}/></button></>}</section>
    <section className="portrait-evidence-stats"><h3>当前学习记录</h3><dl><div><dt>已完成{units}</dt><dd>{routeBusy||routeState.key===source&&routeState.error?'—':profile.completed}<small> / {profile.missing?'待同步':profile.total}</small></dd></div><div><dt>待教师评价</dt><dd>{resolved==='legacy'?'—':profile.submitted}</dd></div><div><dt>已验证练习</dt><dd>{resolved==='legacy'||current.warning.includes('实践评价')?'—':profile.verified}</dd></div></dl><p>阅读、自主确认与教师评价分别保存；这里不生成综合能力分。</p></section>
    {data.courses?.length>0&&<section className="portrait-legacy-note"><BookOpenText size={18}/><div><strong>已有课程进度仍然保留</strong><p>{data.summary?.completedLessons||0} 个已完成课时 · {data.courses.length} 门已加入课程</p><button onClick={()=>{setSource('legacy');setMode('coverage');setDirection('');}}>在雷达中查看旧课程</button><button onClick={()=>onNavigate('/my-learning?view=courses')}>打开我的课程<ArrowUpRight size={14}/></button></div></section>}
   </aside></div>
   {notice&&<p className="portrait-notice" role={notice.startsWith('添加计划失败')?'alert':'status'}>{notice}</p>}
   {!compact&&<section className="portrait-records" aria-label="画像学习证据"><header><div><span>LEARNING EVIDENCE</span><h3>{direction?direction+' · ':''}学习内容与证据</h3><p>{selected?(metric==='practice'?`已验证 ${selected.verified} / ${selected.practices} 个练习原子`:`已完成 ${selected.completed} / ${selected.total} 个${units}`):'每条记录均可回到对应课程或原子的具体版本。'}</p></div>{resolved==='route'&&<label><input type="checkbox" checked={showAll} onChange={e=>setShowAll(e.target.checked)}/>显示未开始内容</label>}</header>
    {!visible.length?<div className="portrait-empty"><h4>这个范围暂时没有学习记录</h4><p>开始阅读或完成课时后，真实记录会在这里汇集。</p><button onClick={()=>onNavigate('/learning?library=atoms')}>探索学习原子<ArrowUpRight size={15}/></button></div>:<div className="portrait-record-grid">{visible.map(item=>resolved==='legacy'?<article key={item.id}><span className="portrait-record-kind">原有课程{item.archived?' · 历史记录':''}</span><h4>{item.title}</h4><p>已完成 {item.completedLessons||0} / {item.lessonCount||0} 个课时 · {item.progressPercent||0}%</p><progress value={item.progressPercent||0} max="100" aria-label={item.title+'课程进度'}/><p>{(data.learningLessons||[]).filter(l=>l.courseId===item.id&&l.progressPercent>=100).flatMap(l=>l.knowledgePoints||[]).slice(0,6).join(' · ')||'知识内容可在课程详情查看。'}</p><button onClick={()=>navigate('/learning?course='+encodeURIComponent(item.id))}>查看课程记录<ArrowUpRight size={15}/></button></article>:<article key={portraitKey(item)} data-stage={item.stage||'new'}><span className="portrait-record-kind">{item.direction} · v{item.revision}</span><h4>{item.title}</h4><p className="portrait-record-status"><CheckCircle size={15}/>{item.stage==='completed'&&item.completion==='practice'?(isVerifiedPractice(item,current.evidence)?'练习已通过 · 有教师评价记录':'练习已完成 · 评价证据待关联'):learningStage[item.stage]||'尚未开始'}</p><p>{item.knowledge.join(' · ')||'知识点尚未标注'}</p><small>{item.completion==='practice'?'练习与教师评价':'阅读与自主确认'}{item.updatedAt?' · '+new Date(item.updatedAt).toLocaleDateString('zh-CN'):''}</small>{item.feedback&&<blockquote>{item.feedback}</blockquote>}<details><summary>查看版本记录</summary>{item.history.length?item.history.map(h=><p key={h.revision}>v{h.revision} · {learningStage[h.stage]}{h.feedback?' · '+h.feedback:''}</p>):<p>该版本尚无学习记录。</p>}</details><button onClick={()=>navigate(atomicUrl(item.id,item.revision))}>查看原子与证据<ArrowUpRight size={15}/></button></article>)}</div>}
   </section>}
  </>}
 </section>;
}
