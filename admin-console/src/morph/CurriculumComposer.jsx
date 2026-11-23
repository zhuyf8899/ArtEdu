import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowUpRight, Spinner } from '@phosphor-icons/react';
import { atomicRequest, createLearningNote } from '../services/adminApi.js';
import { atomicUrl } from '../atomicModel.js';
import { returnContext, withReturnTarget } from '../resourceContext.js';
import { courseReadiness } from '../coursePresentation.js';
import { composeCurriculum, curriculumTopics, curriculumAvailability } from './curriculumModel.js';
import './handoff-details.css';

export function CurriculumComposer({courses=[],topic='',courseId='',nodeId='',revision='',loading,error,onRetry,onNavigate,onNotice}) {
  const [query,setQuery]=useState(''),[saving,setSaving]=useState(false),[saved,setSaved]=useState(false);
  const [selectedNode,setSelectedNode]=useState(null);
  const nodeKey = nodeId && JSON.stringify([nodeId, revision]);
  const activeNode = nodeKey && selectedNode?.key === nodeKey ? selectedNode : null;
  const nodePending = Boolean(nodeKey && !activeNode);
  useEffect(() => {
    if (!nodeId) return;
    let active = true;
    const suffix = revision ? '?revision=' + encodeURIComponent(revision) : '';
    atomicRequest('/nodes/' + encodeURIComponent(nodeId) + suffix).then(node => {
      if (active) setSelectedNode({key: nodeKey, node: node.status === 'published' ? node : null});
    }).catch(() => {
      if (active) setSelectedNode({key: nodeKey, node: null});
    });
    return () => { active = false; };
  }, [nodeId, revision, nodeKey]);
  const selectedCourse = courses.find(course => course.id === courseId && !course.archived && course.status !== 'archived');
  const node = activeNode?.node;
  const seedCourse = useMemo(() => node ? {
    id: node.id, title: node.payload.title, estimatedMinutes: node.payload.minutes,
    href: atomicUrl(node.id, node.revision, node.kind === 'course' ? 'courses' : 'atoms'),
  } : selectedCourse, [node, selectedCourse]);
  const result=useMemo(() => {
    const recommendation = composeCurriculum(topic, courses);
    if (!seedCourse) return recommendation;
    const remaining = recommendation?.steps.filter(({course}) => course.id !== seedCourse.id) ?? [];
    const steps = [{course: seedCourse, reason: '你选的起始内容'}, ...remaining];
    return {title: recommendation?.title ?? seedCourse.title, steps, missing: recommendation?.missing ?? [],
      duration: steps.reduce((total, {course}) => total + Math.max(0, Number(course.estimatedMinutes) || 0), 0)};
  }, [topic, courses, seedCourse]);
  const availability=curriculumAvailability(result);
  const context = returnContext();
  const courseLink = course => course.href ?? '/learning?course=' + encodeURIComponent(course.id);
  const selection = useMemo(() => {
    const params = new URLSearchParams();
    if (courseId) params.set('course', courseId);
    if (nodeId) params.set('node', nodeId);
    if (nodeId && revision) params.set('revision', revision);
    if (context.to) params.set('returnTo', context.to);
    return params.toString();
  }, [courseId, nodeId, revision, context.to]);
  const heading=useRef(null),busy=useRef(false),currentTopic=useRef(topic);
  const pathKey = JSON.stringify([topic, selection]);
  useEffect(()=>{currentTopic.current=pathKey;setSaved(false);if(topic)heading.current?.focus({preventScroll:true});},[topic,pathKey]);
  const recommend=text=>{
    if(!text.trim()) return;
    const params = new URLSearchParams(selection);
    params.set('topic', text.trim());
    setQuery('');
    onNavigate('/curriculum?' + params);
  };
  const save=async()=>{
    if(!result?.steps.length||busy.current||saved)return;
    busy.current=true;setSaving(true);const savingPath=pathKey;
    try {
      await createLearningNote({title:`${result.title.slice(0, 110)} · 学习路径`,content:[`学习目标：${topic || result.title}`,'依据当前课程目录编排的学习建议。',...result.steps.map(({course,reason},index)=>`${index+1}. ${course.title}（${courseReadiness(course)||'已开放'}）\n${reason}\n${courseLink(course)}`)].join('\n\n')});
      if(currentTopic.current===savingPath)setSaved(true);
      onNotice('学习路径已保存到「我的空间 → 学习笔记」。');
    } catch(e){onNotice(e.message,'error');}
    finally {busy.current=false;setSaving(false);}
  };
  return <section className="container curriculum-page morph-curriculum" aria-label="组合我的课程">
    <button type="button" className="curriculum-back" onClick={()=>onNavigate(context.to || '/learning?library=courses')}><ArrowLeft size={16}/>{context.to ? context.label : '返回完整课程'}</button>
    <header><span className="eyebrow">CURRICULUM COMPOSER</span><h1>组合我的课程</h1><p>从你选的课程或原子出发，按学习目标查找目录中的配套课程。</p><button className="button secondary" onClick={()=>onNavigate('/learning?library=courses')}>查看教师编排的完整课程 ↗</button></header>
    <section className="curriculum-conversation" aria-label="课程编排对话" aria-busy={loading || nodePending}>
      <div id="curriculum-messages" aria-live="polite">
        {(courseId || nodeId) && !seedCourse && !(loading || nodePending) && <p role="status">所选内容暂时无法打开，你仍可按学习目标查找课程。</p>}
        {loading || nodePending ? <p role="status">正在读取课程目录…</p> : error && !seedCourse ? <div className="path-result" role="alert"><h2>课程目录暂时无法加载</h2><p>{error}</p><button className="button secondary" onClick={onRetry}>重新加载目录</button></div> : !topic && !seedCourse ? <div className="composer-welcome"><Spinner className="composer-symbol" size={48} weight="thin" aria-hidden="true"/><h2>你想从哪个设计问题开始？</h2><p>选择一个方向，或输入你的学习目标。</p><TopicSuggestions onChoose={recommend}/></div>:<>
          {topic && <div className="curriculum-question">{topic}</div>}
          {!result?<div className="path-result"><h2 ref={heading} tabIndex={-1}>选择一个相关方向</h2><p>当前目录支持信息图表、海报与产品设计路径。选择与你的目标最接近的方向。</p><TopicSuggestions onChoose={recommend}/></div>:<section className="path-result">
            <span className="eyebrow">YOUR LEARNING PATH</span><h2 ref={heading} tabIndex={-1}>{result.title} · 从方法到实践</h2><p>可直接打开学习内容，也可将这条路径保存到学习笔记。</p>{seedCourse && <TopicSuggestions onChoose={recommend}/>}
            {result.missing.length>0&&<p className="curriculum-availability" role="status">部分课程尚未发布，仅展示当前目录中的 {result.steps.length} 门课程。</p>}
            <ol className="path-list">{result.steps.map(({course,reason},index)=><li key={course.id}><span className="path-number">{index+1}</span><div><h3><button type="button" className="title-button" onClick={()=>onNavigate(withReturnTarget(courseLink(course)))}>{course.title}<ArrowUpRight size={17}/></button></h3><p>{reason}</p><small>{course.estimatedMinutes||0} 分钟 · {courseReadiness(course)||'已开放'}{index?' · 承接 '+result.steps[index-1].course.title:' · 共同基础'}</small></div></li>)}</ol>
            <footer><span>{result.steps.length} 门目录课程 · 规划约 {result.duration} 分钟<br/>{availability.availableCount} 门现在可学 · {availability.plannedCount} 门筹备中</span><div>{availability.nextCourse&&<button className="button" onClick={()=>onNavigate(withReturnTarget(courseLink(availability.nextCourse)))}>{availability.review?'回顾可学课程':'从可学课程开始'}<ArrowUpRight size={16}/></button>}<button className="button secondary" disabled={!result.steps.length||saving||saved} onClick={save}>{saving?'正在保存…':saved?'已保存到学习笔记':'保存学习路径'}</button><button className="button secondary" onClick={()=>onNavigate('/my-learning?view=notes')}>我的空间<ArrowUpRight size={16}/></button></div></footer>
          </section>}
        </>}
      </div>
      <form id="curriculum-form" onSubmit={e=>{e.preventDefault();recommend(query);}}><label className="sr-only" htmlFor="curriculum-query">学习目标</label><div className="curriculum-input"><input id="curriculum-query" required maxLength={200} value={query} onChange={e=>setQuery(e.target.value)} placeholder="例如：我想学习信息图表设计"/><button className="button" type="submit">编排路径<ArrowUpRight size={16}/></button></div><small>课程建议依据已发布目录的匹配规则生成，不调用模型。</small></form>
    </section>
  </section>;
}
function TopicSuggestions({onChoose}) {return <div className="curriculum-suggestions">{curriculumTopics.map(topic=><button type="button" key={topic} onClick={()=>onChoose(topic)}>{topic}<ArrowUpRight size={15}/></button>)}</div>;}
