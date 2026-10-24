import { useEffect, useState } from 'react';
import { createLearningTask, atomicRequest } from '../services/adminApi.js';
import { atomicUrl, learningStage } from '../atomicModel.js';
import { courseDirections } from './curriculumModel.js';
import { portraitAtoms } from './atomicPortraitModel.js';
import './atomic-portrait.css';

export function AtomicPortrait({onNavigate,compact=false}) {
 const [items,setItems]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[direction,setDirection]=useState('全部'),[selected,setSelected]=useState(()=>new URLSearchParams(window.location.search).get('atom')||''),[mode,setMode]=useState('map'),[reload,setReload]=useState(0),[notice,setNotice]=useState(''),[saving,setSaving]=useState(false);
 async function plan(atom){setSaving(true);setNotice('');try{await createLearningTask({title:'学习原子：'+atom.title+'（v'+atom.revision+'）',taskType:'custom'});setNotice('已加入学习计划');}catch(e){setNotice(e.message);}finally{setSaving(false);}}
 useEffect(()=>{let active=true;setLoading(true);setError('');atomicRequest('/portrait').then(data=>{if(active)setItems(data.items||[]);}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[reload]);
 const atoms=portraitAtoms(items),visible=atoms.filter(a=>direction==='全部'||a.direction===direction),focus=visible.find(a=>a.id===selected)||visible[0];
 const learned=atoms.filter(a=>a.stage),done=atoms.filter(a=>a.stage==='completed');
 return <section className="morph-space-section atomic-portrait" aria-label="我的专业画像">
 <header className="morph-space-heading"><div><span>PROFESSIONAL PORTRAIT</span><h2>我的专业画像</h2><p>从原子学习出发，连接自己的专业积累。</p></div><button onClick={()=>onNavigate(compact?'/my-learning?view=portrait':'/learning')}>{compact?'查看完整画像':'探索原子课程'} ↗</button></header>
 {loading?<p role="status">正在同步原子学习证据…</p>:error?<div role="alert"><p>画像暂时无法加载：{error}</p><button onClick={()=>setReload(n=>n+1)}>重试</button></div>:<>
 <div className="portrait-stats"><span><strong>{learned.length}</strong> 已学原子</span><span><strong>{done.length}</strong> 已完成学习</span><span><strong>{atoms.filter(a=>a.stage==='submitted').length}</strong> 待评价练习</span></div>
 <p>理解在阅读中萌发，在实践中展开，在对话中逐渐清晰。</p>
 {compact?<div className="portrait-directions">{courseDirections.slice(1).map(d=><span key={d}>{d} · {learned.filter(a=>a.direction===d).length} 个已学原子</span>)}</div>:<>
 <div className="portrait-directions" role="group" aria-label="专业方向">{[...courseDirections,'待标注'].map(d=><button key={d} aria-pressed={direction===d} onClick={()=>setDirection(d)}>{d} · {atoms.filter(a=>d==='全部'||a.direction===d).length}</button>)}</div>
 <div className="portrait-mode" role="group" aria-label="画像浏览方式"><button aria-pressed={mode==='map'} onClick={()=>setMode('map')}>成长图谱</button><button aria-pressed={mode==='list'} onClick={()=>setMode('list')}>学习列表</button></div>
 {notice&&<p role="status">{notice}</p>}<div className="portrait-workspace"><div className={mode==='map'?'portrait-map':'portrait-list'} aria-label="原子知识图谱">
 {visible.length?visible.map(a=><button key={a.id} className={'portrait-node stage-'+(a.stage||'new')} aria-pressed={focus?.id===a.id} onClick={()=>setSelected(a.id)}><strong>{a.title}</strong><small>{a.knowledge.join(' · ')||'知识点待标注'}</small><span>{a.stage==='read'?'已接触':learningStage[a.stage]||'未开始'} · v{a.revision}</span></button>):<div className="morph-space-empty"><h3>新的探索，正从这里开始</h3><p>每一个学过的原子，都将成为这片知识星图上的坐标。你也可以回到“我的课程”，继续已有的旅程。</p><button onClick={()=>onNavigate('/learning')}>探索原子课程</button></div>}
 </div>{focus&&<aside className="portrait-detail"><span>{focus.direction}</span><h3>{focus.title}</h3><p>{focus.summary}</p><h4>关联知识</h4><p>{focus.knowledge.join('、')||'暂未标注'}</p><h4>我的学习证据</h4>{focus.history.map(record=><p key={record.revision}>v{record.revision} · {learningStage[record.stage]||record.stage}{record.feedback?' · '+record.feedback:''}</p>)}<p>{focus.stage==='read'?'已记录阅读':learningStage[focus.stage]||'尚无学习记录'}</p><p>完成方式：{focus.completion==='practice'?'练习与教师评价':'阅读与自我确认'}</p>{focus.feedback&&<blockquote>{focus.feedback}</blockquote>}{focus.updatedAt&&<p>记录时间：{new Date(focus.updatedAt).toLocaleString('zh-CN')}</p>}{focus.publishedRevision!==focus.revision&&<p>保留已学版本 v{focus.revision}；当前公开版本为 v{focus.publishedRevision}。</p>}<button onClick={()=>onNavigate(atomicUrl(focus.id,focus.revision))}>{focus.stage==='completed'?'回顾学习证据':'继续学习'} ↗</button><button disabled={saving} onClick={()=>plan(focus)}>{saving?'正在添加…':'加入学习计划'}</button></aside>}</div>
 <section><h3>下一步学习</h3>{visible.filter(a=>a.stage!=='completed').slice(0,3).map(a=><button className="portrait-next" key={a.id} onClick={()=>onNavigate(atomicUrl(a.id,a.revision))}><strong>{a.title}</strong><span>{a.stage==='needs_revision'?'根据教师反馈修改练习':a.stage?'继续已有的原子学习':'探索当前方向的未学原子'} · {a.minutes} 分钟 ↗</span></button>)}</section>
 </>}
 </>}
 </section>;
}
