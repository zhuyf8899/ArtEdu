import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowClockwise, ArrowCounterClockwise, MagnifyingGlass, Trash, X } from '@phosphor-icons/react';
import { changeContentLifecycle, getManagedCases } from './services/adminApi.js';
import './admin-content-tools.css';

const statuses = { draft: '草稿', pending: '待审核', approved: '已发布', rejected: '已驳回', archived: '回收站' };
export function ContentLifecycleDialog({ item, kind, onClose, onDone, onRefresh }) {
  const dialog = useRef(null), [reason,setReason] = useState(''), [ack,setAck] = useState(false), [busy,setBusy] = useState(false), [error,setError] = useState('');
  const restore = item.status === 'archived';
  useEffect(() => { const previous = document.activeElement, element = dialog.current; element.showModal(); return () => { element.close(); requestAnimationFrame(() => { if (previous?.isConnected) previous.focus(); }); }; }, []);
  const submit = async event => {
    event.preventDefault(); if (busy || !ack || reason.trim().length < 2) return;
    setBusy(true); setError('');
    try { await changeContentLifecycle(kind, item.id, { action: restore ? 'restore' : 'archive', reason: reason.trim(), expectedStatus: item.status }); await onDone(); }
    catch (failure) { setError(failure.message || '操作失败，请重试'); }
    finally { setBusy(false); }
  };
  return createPortal(<dialog ref={dialog} className="content-lifecycle-dialog" aria-labelledby="content-lifecycle-title" onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <header><div><small>CONTENT LIFECYCLE</small><h2 id="content-lifecycle-title">{restore ? '恢复至草稿' : '移入回收站'}</h2></div><button type="button" aria-label="关闭内容操作" disabled={busy} onClick={onClose}><X size={21} /></button></header>
    <form onSubmit={submit}><strong className="content-lifecycle-title">{item.title}</strong><p>{restore ? '恢复后不会直接公开。课程和案例回到草稿，可由作者修改并重新提交审核。' : '内容将从公开目录下架，但原始文件、评论、收藏、学习进度与审核历史都会保留，可在回收站恢复。'}</p>
      <label className="content-lifecycle-reason">操作原因<textarea autoFocus required minLength={2} maxLength={500} rows={3} disabled={busy} value={reason} onChange={event => setReason(event.target.value)} placeholder={restore ? '例如：准备修订后重新发布' : '例如：内容已过时，暂时下架修订'} /><small>{reason.length} / 500 · 将记录操作人、时间和原因</small></label>
      <label className="content-lifecycle-ack"><input type="checkbox" checked={ack} disabled={busy} onChange={event => setAck(event.target.checked)} />{restore ? '我已了解恢复后需要重新审核才能公开' : '我已了解此操作会立即下架，但不会永久删除数据'}</label>
      {error && <div className="content-lifecycle-error" role="alert">{error}<button type="button" onClick={onRefresh} disabled={busy}>关闭并刷新列表</button></div>}
      <footer><button type="button" disabled={busy} onClick={onClose}>取消</button><button type="submit" className={restore ? 'is-restore' : 'is-danger'} disabled={busy || !ack || reason.trim().length < 2}>{busy ? '正在处理…' : restore ? '确认恢复至草稿' : '确认移入回收站'}</button></footer>
    </form>
  </dialog>, document.body);
}

export function AdminCaseManager({ showToast, onChanged }) {
  const [items,setItems] = useState([]), [query,setQuery] = useState(''), [filter,setFilter] = useState('active');
  const [loading,setLoading] = useState(true), [error,setError] = useState(''), [target,setTarget] = useState(null);
  const revision = useRef(0);
  const load = useCallback(async () => {
    const current = ++revision.current; setLoading(true); setError('');
    try { const result = await getManagedCases(); if (current === revision.current) setItems(result.items ?? []); }
    catch (failure) { if (current === revision.current) setError(failure.message); }
    finally { if (current === revision.current) setLoading(false); }
  }, []);
  useEffect(() => { void load(); return () => { revision.current++; }; }, [load]);
  const visible = items.filter(item => (filter === 'all' || filter === 'active' && item.status !== 'archived' || filter === item.status) && `${item.title} ${item.author} ${item.id}`.toLowerCase().includes(query.trim().toLowerCase()));
  return <section className="admin-case-manager" aria-label="案例内容管理">
    <header><div><h2>案例内容管理</h2><p>管理精选与社区案例。删除进入回收站，恢复后重新审核。</p></div><button disabled={loading} onClick={load}><ArrowClockwise size={16} />刷新</button></header>
    <div className="admin-content-filters"><label><MagnifyingGlass size={18} /><input aria-label="搜索管理案例" placeholder="搜索案例、作者或编号" value={query} onChange={event => setQuery(event.target.value)} /></label><select aria-label="管理案例状态" value={filter} onChange={event => setFilter(event.target.value)}><option value="active">在库案例</option>{Object.entries(statuses).map(([value,label]) => <option key={value} value={value}>{label}{value === 'archived' ? `（${items.filter(item => item.status === 'archived').length}）` : ''}</option>)}<option value="all">全部内容</option></select></div>
    {error && <p className="catalog-inline-warning" role="alert">{error}。已有内容仍保留。<button onClick={load}>重新加载</button></p>}
    <p className="admin-content-count" role="status">{loading ? '正在同步案例…' : `${visible.length} / ${items.length} 个案例`}</p>
    <div>{visible.map(item => <article className="admin-content-row" key={item.id}><div><small>{item.collection === 'art-selection' ? '精选艺术案例' : '社区案例'} · {item.discipline} · {item.assetCount} 个文件</small><h3>{item.title}</h3><p>{item.author} · {item.updatedAt ? new Date(item.updatedAt).toLocaleString('zh-CN') : ''}</p></div><span className={`course-state course-state--${item.status}`}>{statuses[item.status] || item.status}</span><div className="admin-content-row__actions"><a href={`/community?work=${encodeURIComponent(item.id)}`} target="_blank" rel="noreferrer">查看案例 ↗</a><button className={item.status === 'archived' ? 'is-restore' : 'is-danger'} onClick={() => setTarget(item)}>{item.status === 'archived' ? <ArrowCounterClockwise size={16} /> : <Trash size={16} />}{item.status === 'archived' ? '恢复草稿' : '删除 / 下架'}</button></div></article>)}</div>
    {!loading && !visible.length && <div className="empty-state"><Trash size={28} /><strong>{filter === 'archived' ? '回收站为空' : '没有匹配的案例'}</strong><span>可切换状态或调整关键词。</span></div>}
    {target && <ContentLifecycleDialog item={target} kind="work" onClose={() => setTarget(null)} onRefresh={() => { setTarget(null); void load(); }} onDone={async () => { setTarget(null); await load(); onChanged?.(); showToast('案例状态已更新，文件与历史记录已保留'); }} />}
  </section>;
}
