import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowUpRight, Spinner } from '@phosphor-icons/react';
import { createLearningNote } from '../services/adminApi.js';
import { courseReadiness } from '../coursePresentation.js';
import { composeCurriculum, curriculumTopics, curriculumAvailability } from './curriculumModel.js';
import './handoff-details.css';

export function CurriculumComposer({courses=[],topic='',loading,error,onRetry,onNavigate,onNotice}) {
  const [query,setQuery]=useState(''),[saving,setSaving]=useState(false),[saved,setSaved]=useState(false);
  const result=useMemo(()=>composeCurriculum(topic,courses),[topic,courses]);
  const availability=curriculumAvailability(result);
  const heading=useRef(null),busy=useRef(false),currentTopic=useRef(topic);
  useEffect(()=>{currentTopic.current=topic;setSaved(false);if(topic)heading.current?.focus({preventScroll:true});},[topic]);
  const recommend=text=>{if(text.trim()){setQuery('');onNavigate('/curriculum?topic='+encodeURIComponent(text.trim()));}};
  const save=async()=>{
    if(!result?.steps.length||busy.current||saved)return;
    busy.current=true;setSaving(true);const savingTopic=topic;
    try {
      await createLearningNote({title:`${result.title} · 学习路径`,content:[`学习目标：${topic}`,'依据当前课程目录编排的学习建议。',...result.steps.map(({course,reason},index)=>`${index+1}. ${course.title}（${courseReadiness(course)||'已开放'}）\n${reason}\n/learning?course=${encodeURIComponent(course.id)}`)].join('\n\n')});
      if(currentTopic.current===savingTopic)setSaved(true);
      onNotice('学习路径已保存到「我的空间 → 学习笔记」。');
    } catch(e){onNotice(e.message,'error');}
    finally {busy.current=false;setSaving(false);}
  };
  return <section className="container curriculum-page morph-curriculum" aria-label="AI 编排课程体系">
    <button type="button" className="curriculum-back" onClick={()=>onNavigate('/learning')}><ArrowLeft size={16}/>原子课程</button>
    <header><span className="eyebrow">CURRICULUM COMPOSER</span><h1>AI 编排课程体系</h1><p>告诉我你想学什么，把分散的课程原子连接成一条学习路径。</p><button className="button secondary" onClick={()=>onNavigate('/learning?library=courses')}>查看教师编排的完整课程 ↗</button></header>
    <section className="curriculum-conversation" aria-label="课程编排对话" aria-busy={loading}>
      <div id="curriculum-messages" aria-live="polite">
        {!topic?<div className="composer-welcome"><Spinner className="composer-symbol" size={48} weight="thin" aria-hidden="true"/><h2>你想从哪个设计问题开始？</h2><p>选择一个方向，或输入你的学习目标。</p><TopicSuggestions onChoose={recommend}/></div>:<>
          <div className="curriculum-question">{topic}</div>
          {loading?<p role="status">正在读取课程目录…</p>:error?<div className="path-result" role="alert"><h2>课程目录暂时无法加载</h2><p>{error}</p><button className="button secondary" onClick={onRetry}>重新加载目录</button></div>:!result?<div className="path-result"><h2 ref={heading} tabIndex={-1}>选择一个相关方向</h2><p>当前目录支持信息图表、海报与产品设计路径。选择与你的目标最接近的方向。</p><TopicSuggestions onChoose={recommend}/></div>:<section className="path-result">
            <span className="eyebrow">YOUR LEARNING PATH</span><h2 ref={heading} tabIndex={-1}>{result.title} · 从方法到实践</h2><p>先建立通用基础，再进入专业应用。建议按以下顺序学习；筹备课程可先查看规划。</p>
            {result.missing.length>0&&<p className="curriculum-availability" role="status">部分课程尚未发布，仅展示当前目录中的 {result.steps.length} 门课程。</p>}
            <ol className="path-list">{result.steps.map(({course,reason},index)=><li key={course.id}><span className="path-number">{index+1}</span><div><h3><button type="button" className="title-button" onClick={()=>onNavigate('/learning?course='+encodeURIComponent(course.id))}>{course.title}<ArrowUpRight size={17}/></button></h3><p>{reason}</p><small>{course.estimatedMinutes||0} 分钟 · {courseReadiness(course)||'已开放'}{index?' · 承接 '+result.steps[index-1].course.title:' · 共同基础'}</small></div></li>)}</ol>
            <footer><span>{result.steps.length} 门原子课程 · 规划约 {result.duration} 分钟<br/>{availability.availableCount} 门现在可学 · {availability.plannedCount} 门筹备中</span><div>{availability.nextCourse&&<button className="button" onClick={()=>onNavigate('/learning?course='+encodeURIComponent(availability.nextCourse.id))}>{availability.review?'回顾可学课程':'从可学课程开始'}<ArrowUpRight size={16}/></button>}<button className="button secondary" disabled={!result.steps.length||saving||saved} onClick={save}>{saving?'正在保存…':saved?'已保存到学习笔记':'保存学习路径'}</button><button className="button secondary" onClick={()=>onNavigate('/my-learning?view=notes')}>我的空间<ArrowUpRight size={16}/></button></div></footer>
          </section>}
        </>}
      </div>
      <form id="curriculum-form" onSubmit={e=>{e.preventDefault();recommend(query);}}><label className="sr-only" htmlFor="curriculum-query">学习目标</label><div className="curriculum-input"><input id="curriculum-query" required maxLength={200} value={query} onChange={e=>setQuery(e.target.value)} placeholder="例如：我想学习信息图表设计"/><button className="button" type="submit">编排路径<ArrowUpRight size={16}/></button></div><small>依据当前课程目录推荐 · 模型服务待接入</small></form>
    </section>
  </section>;
}
function TopicSuggestions({onChoose}) {return <div className="curriculum-suggestions">{curriculumTopics.map(topic=><button type="button" key={topic} onClick={()=>onChoose(topic)}>{topic}<ArrowUpRight size={15}/></button>)}</div>;}
