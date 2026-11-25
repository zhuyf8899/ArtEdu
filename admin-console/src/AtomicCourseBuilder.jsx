import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Check, Plus, X } from '@phosphor-icons/react';
import { atomicRequest } from './services/adminApi.js';
import { atomicKinds, moveAtomicStep } from './atomicModel.js';

const pageSize = 24;

export function AtomicCourseBuilder({ steps, initialSteps = [], onChange }) {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [attempt, setAttempt] = useState(0);
  const [results, setResults] = useState(null);
  const [titles, setTitles] = useState(() => Object.fromEntries(initialSteps.map(step => [step.atomId, step.title])));
  const filters = new URLSearchParams({ view: 'atoms', query: query.trim(), page: String(page) }).toString();

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      atomicRequest('/catalog?' + filters).then(
        data => { if (active) setResults({ filters, attempt, ...data }); },
        error => { if (active) setResults({ filters, attempt, error: error.message }); },
      );
    }, 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [filters, attempt]);

  const current = results?.filters === filters && results.attempt === attempt ? results : null;
  const required = steps.filter(step => step.required).length;
  const stepTitle = id => titles[id] || '原子 ' + id;
  const updateStep = (index, patch) => onChange(steps.map((step, i) => i === index ? { ...step, ...patch } : step));
  const remove = id => onChange(steps.filter(step => step.atomId !== id).map(step => ({
    ...step, prerequisites: step.prerequisites.filter(parent => parent !== id),
  })));
  const add = item => {
    setTitles(currentTitles => ({ ...currentTitles, [item.id]: item.title }));
    onChange([...steps, { atomId: item.id, revision: item.revision, required: true, context: '', task: '', prerequisites: [] }]);
  };

  return <div className="atomic-course-builder">
    <section className="atomic-picker authoring-picker" aria-label="可引用原子">
      <h3>选择已发布原子</h3>
      <input type="search" aria-label="筛选可引用原子" value={query} maxLength={100}
        placeholder="搜索标题、知识点或学习目标" onChange={event => { setQuery(event.target.value); setPage(1); }}/>
      <p role="status">{!current ? '正在加载原子…' : current.error ? '' : `${current.total} 个匹配原子`}</p>
      {current?.error && <p role="alert">{current.error} <button type="button" onClick={() => setAttempt(value => value + 1)}>重试</button></p>}
      {current?.items?.length === 0 && <p>{query.trim() ? '没有匹配结果，请换一个关键词。' : '暂无已发布原子。原子审核发布后会出现在这里。'}</p>}
      {current?.items?.length > 0 && <div className="authoring-picker-results">{current.items.map(item => {
        const added = steps.some(step => step.atomId === item.id);
        return <button type="button" key={item.id} disabled={added || steps.length >= 50} onClick={() => add(item)}>
          <span>{item.title}<small>{[item.direction, atomicKinds[item.kind], `v${item.revision}`].filter(Boolean).join(' · ')}</small></span>
          {added ? <span className="authoring-picker-added"><Check size={16}/>已添加</span> : <Plus size={18} aria-hidden="true"/>}
        </button>;
      })}</div>}
      {current?.total > pageSize && <div className="atomic-pagination">
        <button type="button" disabled={page === 1} onClick={() => setPage(value => value - 1)}>上一页</button>
        <span>{page} / {Math.ceil(current.total / pageSize)}</span>
        <button type="button" disabled={page * pageSize >= current.total} onClick={() => setPage(value => value + 1)}>下一页</button>
      </div>}
    </section>
    <section className="authoring-sequence" aria-label="已选原子顺序">
      <header><h3>课程顺序</h3><span role="status">已选 {steps.length} · 必修 {required}</span></header>
      {!steps.length && <p>添加至少一个已发布原子。添加顺序就是学习顺序，可随时调整。</p>}
      {steps.length > 0 && !required && <p role="alert">至少保留一个必修原子。</p>}
      {steps.length >= 50 && <p role="status">已达到 50 个原子的上限。</p>}
      <ol className="atomic-edit-steps">{steps.map((step, index) => {
        const previous = steps.slice(0, index);
        const invalid = step.prerequisites.some(id => !previous.some(item => item.atomId === id));
        return <li key={step.atomId}>
          <header>
            <strong>{index + 1}. {stepTitle(step.atomId)} <small>v{step.revision} · {step.required ? '必修' : '选修'}</small></strong>
            <div>
              <button type="button" aria-label={`上移第${index + 1}项`} disabled={!index} onClick={() => onChange(moveAtomicStep(steps, index, -1))}><ArrowUp size={16}/></button>
              <button type="button" aria-label={`下移第${index + 1}项`} disabled={index === steps.length - 1} onClick={() => onChange(moveAtomicStep(steps, index, 1))}><ArrowDown size={16}/></button>
              <button type="button" aria-label={`移除${stepTitle(step.atomId)}`} onClick={() => remove(step.atomId)}><X size={16}/></button>
            </div>
          </header>
          {invalid && <p role="alert">先修原子需排在本项之前。可调整顺序或清除先修。 <button type="button" onClick={() => updateStep(index, { prerequisites: step.prerequisites.filter(id => previous.some(item => item.atomId === id)) })}>移除冲突先修</button></p>}
          <details className="authoring-options">
            <summary>学习要求与任务</summary>
            <div>
              <label className="atomic-checkbox"><input type="checkbox" checked={step.required} onChange={event => updateStep(index, { required: event.target.checked })}/>计入必修进度</label>
              <label>本课程中的学习理由（选填）<input maxLength={1000} value={step.context} onChange={event => updateStep(index, { context: event.target.value })}/></label>
              <label>课程专属任务（选填）<textarea maxLength={2000} value={step.task} onChange={event => updateStep(index, { task: event.target.value })}/></label>
              {previous.length > 0 && <fieldset className="authoring-prerequisites">
                <legend>先修原子（选填）</legend>
                {previous.map(item => <label key={item.atomId} className="atomic-checkbox"><input type="checkbox" checked={step.prerequisites.includes(item.atomId)}
                  onChange={event => updateStep(index, { prerequisites: event.target.checked ? [...step.prerequisites, item.atomId] : step.prerequisites.filter(id => id !== item.atomId) })}/>{stepTitle(item.atomId)}</label>)}
              </fieldset>}
            </div>
          </details>
        </li>;
      })}</ol>
    </section>
  </div>;
}
