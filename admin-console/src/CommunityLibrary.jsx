import { useEffect, useMemo, useRef, useState } from "react";
import {createPortal} from 'react-dom';
import { ArrowClockwise, ArrowLeft, ArrowRight, BookmarkSimple, ChatCircle, Flag, Heart, ImageSquare, MagnifyingGlass, PaperPlaneTilt, Plus, SpinnerGap, X } from "@phosphor-icons/react";
import { addWorkComment, getMyWorks, getWork, getWorkflows, getCommunityWorks, reportComment, reportWork, submitWork, toggleWorkReaction, setWorkCollection } from "./services/adminApi.js";
import { useFeedback } from "./FeedbackCenter.jsx";
import { CaseStoryEditor } from "./CaseStoryEditor.jsx";
import { caseReviewIssues } from './caseStory.js';
import { CaseStoryView } from "./CaseStoryView.jsx";
import { ImageLightbox } from "./ImageLightbox.jsx";
import { CASE_COLLECTIONS, caseCollectionLabel } from "./communityCollections.js";
import "./case-story.css";
import { MorphPageBanner, MorphCaseCard } from './morph/MorphCatalog.jsx';
import { CatalogControls } from './morph/CatalogControls.jsx';
import { loadCommunityCatalog, mergeWorkRecord } from './communityData.js';
import { returnContext, withReturnTarget } from './resourceContext.js';
import { useScopedViewState } from './useScopedViewState.js';
import { useDialogFocus } from './useDialogFocus.js';

export function CommunityLibrary({ account, onNotice, onOpenWorkflow, onNavigate, initialWorkId = '', openPublisher = false, variant = 'classic' }) {
  const { confirmAction } = useFeedback();
  const [works, setWorks] = useState([]);
  const [myWorks, setMyWorks] = useState([]);
  const [workflows, setWorkflows] = useState([]);
  const [selected, setSelected] = useState(null);
  const [editing, setEditing] = useState(undefined);
  const [savedPreview, setSavedPreview] = useState(null);
  const [activeImage, setActiveImage] = useState(null);
  const [reportTarget, setReportTarget] = useState(null);
  const [comment, setComment] = useState("");
  const [discussionOrder, setDiscussionOrder] = useState('newest');
  const [loading, setLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [detailRetry, setDetailRetry] = useState(0);
  const [interactionBusy, setInteractionBusy] = useState(false);
  const [collectionBusy, setCollectionBusy] = useState(false);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState("");
  const [supportError, setSupportError] = useState('');
  const catalogRequest = useRef(0);
  const nextRequest = useRef(false);
  const loadedFilter = useRef(null);
  const [catalogPage, setCatalogPage] = useState(1);
  const [catalogTotal, setCatalogTotal] = useState(0);
  const [catalogHasMore, setCatalogHasMore] = useState(false);
  const [labelGroups, setLabelGroups] = useState({});
  const [loadingMore, setLoadingMore] = useState(false);
  const [pageError, setPageError] = useState('');
  const [search, setSearch] = useScopedViewState(account.id+":community:search","");
  const [activeTag, setActiveTag] = useScopedViewState(account.id+":community:tag","");
  const [activeGroup, setActiveGroup] = useScopedViewState(account.id+":community:group","大类");
  // 轻量、可解释的本地排序：优先复用用户已点赞/收藏作品的学科、工具与方法，
  // 新用户则退化为社区互动与发布时间，不需要画像上传或外部追踪。
  const recommendations = useMemo(() => recommendWorks(works), [works]);
  const refresh = async (showLoading = false) => {
    const requestId=++catalogRequest.current;
    setCatalogLoading(true);
    setCatalogError("");
    nextRequest.current = false;
    setLoadingMore(false);
    setPageError('');
    try {
      const data=await loadCommunityCatalog({catalog:()=>getCommunityWorks({query:search.trim(),category:activeTag}),mine:async()=>({items:myWorks}),workflows:async()=>({items:workflows})});
      if(requestId!==catalogRequest.current) return;
      loadedFilter.current = JSON.stringify([search.trim(), activeTag]);
      setCatalogPage(1); setCatalogTotal(data.catalog.total ?? data.works.length);
      setCatalogHasMore(Boolean(data.catalog.hasMore)); setLabelGroups(data.catalog.labelGroups ?? {});
      setWorks(data.works); setMyWorks(data.myWorks); setWorkflows(data.workflows); setSupportError(data.supportError);
    } catch (error) { if(requestId===catalogRequest.current) {setCatalogError(error.message); throw error;} }
    finally { if(requestId===catalogRequest.current) setCatalogLoading(false); }
  };
  useEffect(() => {
    catalogRequest.current++;
    nextRequest.current = false;
    setCatalogLoading(!initialWorkId);
    if (initialWorkId) return;
    const timer = setTimeout(() => refresh(true).catch(error => onNotice(error.message)), 250);
    return () => { clearTimeout(timer); catalogRequest.current++; };
  }, [search, activeTag, initialWorkId]);
  const loadNextPage = async () => {
    if (nextRequest.current || catalogLoading || catalogError || !catalogHasMore || loadedFilter.current !== JSON.stringify([search.trim(), activeTag])) return;
    const requestId = catalogRequest.current;
    nextRequest.current = true; setLoadingMore(true); setPageError('');
    try {
      const result = await getCommunityWorks({query:search.trim(),category:activeTag,page:catalogPage+1});
      if (requestId !== catalogRequest.current) return;
      setWorks(current => [...new Map([...current,...result.items].map(work=>[work.id,work])).values()]);
      setCatalogPage(result.page); setCatalogTotal(result.total); setCatalogHasMore(result.hasMore);
    } catch (error) { if (requestId === catalogRequest.current) setPageError(error.message); }
    finally { if (requestId === catalogRequest.current) {nextRequest.current=false;setLoadingMore(false);} }
  };
  useEffect(() => {
    // 分享同一社区页面的作品链接；仅请求指定作品，权限仍由 API 检查。
    setSelected(null); setActiveImage(null); setReportTarget(null); setComment(''); setDetailError('');
    if (!initialWorkId) { setLoading(false); return; }
    let active = true;
    setLoading(true);
    getWork(encodeURIComponent(initialWorkId)).then(work => { if (active) setSelected(work); }).catch(error => { if (active) { setDetailError(error.message); onNotice(error.message); } }).finally(() => { if(active) setLoading(false); });
    return () => { active = false; };
  }, [initialWorkId, detailRetry]);
  useEffect(()=>{ if(openPublisher&&!initialWorkId)setEditing(null); },[openPublisher,initialWorkId]);
  useEffect(() => {
    if (editing === undefined || workflows.length) return;
    let active = true;
    getWorkflows().then(result => { if (active) setWorkflows(result.items ?? []); }).catch(error => { if (active) onNotice(error.message); });
    return () => { active = false; };
  }, [editing]);
  useEffect(() => {
    if (catalogLoading || initialWorkId || selected) return;
    // Previously shared section links now open the same list.
    const scrollToCatalog = () => {
      if (['#featured-art-cases', '#community-cases', '#case-catalog'].includes(window.location.hash)) {
        document.getElementById('case-catalog')?.scrollIntoView();
      }
    };
    scrollToCatalog();
    window.addEventListener('hashchange', scrollToCatalog);
    return () => window.removeEventListener('hashchange', scrollToCatalog);
  }, [catalogLoading, initialWorkId, selected]);
  useEffect(() => {
    let active = true;
    getMyWorks().then(result => { if(active)setMyWorks(result.items ?? []); }).catch(error => {if(active)setSupportError(error.message);});
    return () => {active=false;};
  }, [account.id, editing]);
  const context = returnContext();
  const returnToCatalog = () => { setSelected(null); setActiveImage(null); setDetailError(''); onNavigate?.(context.to || '/community'); };
  // Refresh matching records only; a delayed interaction cannot reopen a different work.
  const syncWork = work => {
    setSelected(current => current?.id === work.id ? work : current);
    setWorks(current => mergeWorkRecord(current, work));
    setMyWorks(current => mergeWorkRecord(current, work));
  };
  const openWork = async work => {
    if(onNavigate) { onNavigate(withReturnTarget('/community?work='+encodeURIComponent(work.id))); return; }
    setLoading(true);
    try { setSelected(await getWork(work.id)); }
    catch (error) { onNotice(error.message); }
    finally { setLoading(false); }
  };
  useEffect(() => {
    if (!savedPreview) return;
    // Let the closed editor remove its unsaved-changes guard before opening the draft.
    if (onNavigate && savedPreview.id !== initialWorkId) void openWork(savedPreview);
    else setSelected(savedPreview);
    setSavedPreview(null);
  }, [savedPreview]);
  const react = async reaction => {
    if(interactionBusy) return;
    const workId=selected.id; setInteractionBusy(true);
    try { await toggleWorkReaction(workId, reaction); syncWork(await getWork(workId)); }
    catch (error) { onNotice(error.message); }
    finally { setInteractionBusy(false); }
  };
  const sendComment = async event => {
    event.preventDefault();
    if (!comment.trim() || interactionBusy) return;
    const workId=selected.id,content=comment; setInteractionBusy(true);
    try { await addWorkComment(workId, content); setComment(current => current === content ? '' : current); syncWork(await getWork(workId)); }
    catch (error) { onNotice(error.message); }
    finally { setInteractionBusy(false); }
  };
  const submitReport = async input => {
    try {
      if (reportTarget.type === "work") await reportWork(reportTarget.id, input);
      else await reportComment(reportTarget.id, input);
      setReportTarget(null); onNotice("举报已提交，运营人员会尽快处理");
    } catch (error) { onNotice(error.message); }
  };
  const submit = async () => {
    if (loading || reviewIssues.length) return;
    const action = directPublish ? '发布案例' : '提交案例审核';
    if (!await confirmAction({
      title: action,
      message: directPublish ? '确认后，案例将公开显示在案例社区。' : '请确认作品署名与展示授权。审核通过后，案例将公开显示。',
      confirmLabel: directPublish ? '确认发布' : '确认提交',
    })) return;
    setLoading(true);
    try {
      const result = await submitWork(selected.id);
      syncWork(result);
      onNotice(result.status === 'approved' ? '案例已发布' : '已提交管理员审核');
    }
    catch (error) { onNotice(error.message); }
    finally { setLoading(false); }
  };
  const directPublish = account.roles.some(role => ['teacher','admin'].includes(role));
  const owned = selected?.authorId === account.id;
  const previewing = owned && (['draft','rejected'].includes(selected.status) || directPublish && selected.status === 'pending');
  const reviewIssues = previewing ? caseReviewIssues(selected) : [];
  const canCurate = account?.roles?.some(role => ["admin", "operator"].includes(role));
  const changeCollection = async collection => {
    if (collectionBusy || !selected || !canCurate) return;
    setCollectionBusy(true);
    try { await setWorkCollection(selected.id, collection); setSelected(await getWork(selected.id)); await refresh(); onNotice(`案例标签已更新为${CASE_COLLECTIONS[collection]}`); }
    catch (error) { onNotice(error.message); }
    finally { setCollectionBusy(false); }
  };
  const groupTags = [...new Set(labelGroups[activeGroup] ?? works.flatMap(work => workLabelGroups(work)[activeGroup] ?? []))].sort((left, right) => {
    if(variant==='morph'&&activeGroup==='大类'){
      const leftRank=handoffCaseCategories.indexOf(left),rightRank=handoffCaseCategories.indexOf(right);
      const order=(leftRank<0?Infinity:leftRank)-(rightRank<0?Infinity:rightRank);
      if(order)return order;
    }
    return left.localeCompare(right,'zh-CN');
  });
  const visibleWorks = works;
  const hasFilters = Boolean(search || activeTag);
  const clearFilters = () => { setSearch(""); setActiveTag(""); };
  const submissions = myWorks.length > 0 && (
    <details className="case-my-submissions">
      <summary>我的投稿 <span>{myWorks.length}</span></summary>
      <ul>{myWorks.map(work => <li key={work.id}>
        <button type="button" onClick={() => openWork(work)}>
          <strong>{work.title}</strong><span>{statusName(work.status)}</span><ArrowRight size={16} aria-hidden="true"/>
        </button>
      </li>)}</ul>
    </details>
  );
  const editor = editing !== undefined && <CaseStoryEditor key={editing?.id ?? "new"} initial={editing} workflows={workflows} directPublish={directPublish}
    onClose={() => { setEditing(undefined); if(openPublisher)onNavigate?.('/community'); refresh().catch(error => onNotice(error.message)); }}
    onSaved={saved => {
      setEditing(undefined);
      setSavedPreview(saved);
      refresh().catch(error => onNotice(error.message));
      onNotice(saved.status === 'approved' ? '案例修改已保存' : `草稿已保存。预览后可${directPublish ? '直接发布' : '提交审核'}。`);
    }}/>;
  if (initialWorkId && !selected) return <section className="resource-load-state" aria-busy={loading||!detailError}><strong>{detailError?'案例暂时无法打开':'正在打开案例…'}</strong>{detailError&&<><p role="alert">{detailError}</p><button onClick={()=>setDetailRetry(value=>value+1)}>重新加载案例</button></>}<button onClick={returnToCatalog}>{context.to?context.label:'返回案例社区'}</button></section>;
  if (catalogLoading && !works.length && !selected && !initialWorkId) return <section className="resource-load-state" aria-busy="true"><span className="page-loading__spinner" aria-hidden="true" /><strong>正在加载案例社区</strong></section>;
  if (catalogError && !works.length && !myWorks.length) return <section className="resource-load-state resource-load-state--error"><ArrowClockwise size={31} /><strong>案例社区暂时无法加载</strong><p>{catalogError}</p><button onClick={() => refresh(true).catch(error => onNotice(error.message))}>重新加载</button></section>;
  if (selected) {
    const exhibition = selected.story?.origin === "collected" && selected.story?.displayStyle === "exhibition";
    const heroAsset = selected.assets?.find(asset => asset.asset_type === "image" && asset.url === selected.previewUrl) ?? selected.assets?.find(asset => asset.asset_type === "image");
    return <><section className={`community-detail${exhibition ? " community-detail--exhibition" : ""}`}>
    <button className="learning-back" onClick={returnToCatalog}><ArrowLeft size={16} /> {context.to ? context.label : '返回案例社区'}</button>
    {supportError&&<p className="catalog-inline-warning" role="status">{supportError}。<button onClick={()=>refresh().catch(error=>onNotice(error.message))}>重新同步</button></p>}
    {previewing && <section className="case-draft-actions" aria-label="案例草稿发布操作">
      <div>
        <strong>{selected.status === 'pending' ? '待审案例' : '草稿预览'}</strong>
        {reviewIssues.length ? <ul>{reviewIssues.map(issue=><li key={issue}>{issue}</li>)}</ul> : <small>{directPublish ? '发布后，案例将显示在案例社区。' : '审核通过后，案例将显示在案例社区。'}</small>}
      </div>
      <button disabled={loading} onClick={() => setEditing(selected)}>{reviewIssues.length ? '继续填写' : '编辑案例'}</button>
      <button disabled={loading || reviewIssues.length > 0} onClick={submit}>{directPublish ? '发布案例' : '提交管理员审核'}</button>
    </section>}
    <div className="community-detail__hero">{selected.previewUrl ? <button className="case-image-button case-image-button--hero" onClick={() => setActiveImage({ url: selected.previewUrl, fileName: heroAsset?.file_name ?? selected.title, alt: selected.title })} aria-label={`查看并下载图片：${selected.title}`}><img src={selected.previewUrl} alt={selected.title} /></button> : <WorkVisualFallback work={selected} />}</div>
    <div className="community-detail__body">
      <header><div><span className="community-detail__category">{selected.discipline} · {exhibition ? "外部艺术案例" : statusName(selected.status)}</span>{exhibition && <p className="community-detail__artist">{selected.creators?.join("、") || selected.author}</p>}<h2>{selected.title}</h2>{!exhibition && <p>{selected.creators?.join("、") || selected.author} · {selected.tags?.map(tag => tag.name).join(" / ") || "未添加标签"}</p>}{exhibition && <div className="case-labels">{selected.tags?.map(tag => <span key={tag.id ?? tag.name}>{tag.name}</span>)}</div>}</div>
        {selected.status === "approved" && <div aria-busy={interactionBusy}><button aria-label="点赞案例" aria-pressed={selected.liked} disabled={interactionBusy} onClick={() => react("like")}><Heart weight={selected.liked ? "fill" : "bold"} /> {selected.likeCount}</button><button aria-label="收藏案例" aria-pressed={selected.favorited} disabled={interactionBusy} onClick={() => react("favorite")}><BookmarkSimple weight={selected.favorited ? "fill" : "bold"} /> {selected.favoriteCount}</button></div>}
      </header>
      {canCurate && selected.status === "approved" && <div className="case-collection-control"><label>案例归属标签<select aria-label="案例归属标签" disabled={collectionBusy} value={selected.collection ?? "community"} onChange={event => changeCollection(event.target.value)}>{Object.entries(CASE_COLLECTIONS).map(([value,label]) => <option value={value} key={value}>{label}</option>)}</select></label>{collectionBusy && <span role="status">正在保存…</span>}</div>}
      {selected.status === "rejected" && selected.latestRejection?.reason && <section className="case-review-feedback"><strong>审核意见 · {formatReviewDate(selected.latestRejection.createdAt)}</strong><p>{selected.latestRejection.reason}</p><small>修改并保存后，可再次提交审核；历史审核记录会保留。</small></section>}
      {selected.reviewHistory?.length > 0 && <details className="case-review-history"><summary>查看审核历史（{selected.reviewHistory.length}）</summary>{selected.reviewHistory.map((event, index) => <article key={`${event.action}-${event.createdAt}-${index}`}><strong>{reviewActionName(event.action)}</strong><time>{formatReviewDate(event.createdAt)}</time>{event.reason && <p>{event.reason}</p>}</article>)}</details>}
      <p className="community-summary">{selected.summary}</p>
      <CaseStoryView work={selected} onOpenImage={setActiveImage} exhibition={exhibition} />
      {!!selected.workflows?.length && <div className="same-workflow"><span>关联的教学工作流</span>{selected.workflows.map(workflow => <button key={workflow.id} onClick={() => onOpenWorkflow?.(workflow.id)}>查看「{workflow.name}」<ArrowRight size={15} /></button>)}</div>}
      {selected.status === "approved" && <><div className="community-report-row"><button onClick={() => setReportTarget({ type: "work", id: selected.id, label: selected.title })}><Flag size={16} /> 举报作品</button></div>
        <section className="comment-section" aria-labelledby="case-discussion-heading">
          <header className="comment-section__heading"><div><h3 id="case-discussion-heading"><ChatCircle size={22} />创作讨论 <span>{selected.comments?.length ?? 0}</span></h3><p>交流创作思路，分享具体建议与新的发现。</p></div><label>排序<select aria-label="讨论排序" value={discussionOrder} onChange={event => setDiscussionOrder(event.target.value)}><option value="newest">最新讨论</option><option value="oldest">最早讨论</option></select></label></header>
          <div className="comment-section__list">{(discussionOrder === 'newest' ? [...(selected.comments ?? [])].reverse() : selected.comments ?? []).map(item => <article key={item.id}>
            <span className="comment-avatar" aria-hidden="true">{Array.from(item.author || '访').slice(0,1)}</span><div className="comment-content"><header><strong>{item.author}</strong>{(item.createdAt || item.created_at) && <time dateTime={item.createdAt || item.created_at}>{new Date(item.createdAt || item.created_at).toLocaleString('zh-CN', { month:'long', day:'numeric', hour:'2-digit', minute:'2-digit' })}</time>}<button type="button" className="comment-report" aria-label={`举报${item.author}的讨论`} onClick={() => setReportTarget({ type: "comment", id: item.id, label: "这条评论" })}><Flag size={14} />举报</button></header><p>{item.content}</p></div>
          </article>)}{!selected.comments?.length && <p className="comment-section__empty">还没有讨论，来分享你对这件作品的看法。</p>}</div>
          <form onSubmit={sendComment} className="comment-composer"><label htmlFor="case-comment">参与讨论</label><textarea id="case-comment" rows={3} maxLength={2000} value={comment} onChange={event => setComment(event.target.value)} disabled={interactionBusy} aria-label="发表创作讨论" aria-describedby="case-comment-help" placeholder="你关注作品的哪个细节？写下你的建议或问题…" onKeyDown={event => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} /><footer><span id="case-comment-help">友善交流 · {comment.length} / 2000</span><button type="submit" disabled={!comment.trim() || interactionBusy} aria-label="发表讨论"><PaperPlaneTilt size={17} />{interactionBusy ? '正在发表…' : '发表讨论'}</button></footer></form>
        </section></>}
    </div>
  </section>{activeImage && <ImageViewer image={activeImage} assets={selected.assets} onChange={setActiveImage} onClose={() => setActiveImage(null)} />}{reportTarget && <ReportDialog target={reportTarget} onClose={() => setReportTarget(null)} onSubmit={submitReport} />}{editor}</>;
  }
  return <>
    {variant === 'morph' && <MorphPageBanner title="案例社区" eyebrow="CASE COMMUNITY"/>}
    <div className={variant === 'morph' ? 'container morph-community-catalog' : undefined}>
    {(supportError||catalogError)&&<p className="catalog-inline-warning" role="status">{catalogError||supportError}。可重试同步，不影响已加载案例的浏览。<button onClick={()=>refresh().catch(error=>onNotice(error.message))}>重新同步</button></p>}
    {variant !== 'morph' && <section className="learning-library-intro community-page-intro" aria-labelledby="community-page-title">
      <div className="learning-library-intro__copy">
        <p className="learning-library-intro__eyebrow">ARTEDU · COMMUNITY</p>
        <div className="learning-library-intro__title-row"><h1 id="community-page-title">案例社区</h1><span>{works.length} 个案例</span></div>
        <p>从精选艺术中获得灵感，在社区案例中交流创作方法。</p>
      </div>
      <button type="button" className="community-create-draft" onClick={() => setEditing(null)}><Plus size={18} weight="bold" /> 上传案例</button>
    </section>}
    {variant !== 'morph' && submissions}
    {variant !== 'morph' && !!recommendations.length && <section className="community-recommendations"><header><div><small>// FOR YOU</small><h3>为你推荐</h3><p>{recommendations.personalized ? "根据你已点赞或收藏案例的方向排序" : "先从社区互动较高、较新的案例开始探索"}</p></div></header><div>{recommendations.items.map(work => <button key={work.id} disabled={loading} onClick={() => openWork(work)}>{work.previewUrl ? <img src={work.previewUrl} alt="" /> : <ImageSquare size={23} />}<span><strong>{work.title}</strong><small>{work.discipline} · {work.reason}</small></span><ArrowRight size={16} /></button>)}</div></section>}
    {variant === 'morph' ? <CatalogControls key={activeGroup} compact label="案例筛选"
      extra={<>
        <details className="morph-case-filter-dimensions">
          <summary>{activeGroup === '大类' ? '其他分类方式' : caseGroupLabels[activeGroup]}</summary>
          <div role="group" aria-label="案例分类维度">
            {Object.entries(caseGroupLabels).map(([group, label]) => (
              <button type="button" key={group} aria-pressed={activeGroup === group} onClick={() => { setActiveGroup(group); setActiveTag(''); }}>{label}</button>
            ))}
          </div>
        </details>
        <div className="morph-community-utilities">
          <button type="button" className="button secondary" onClick={() => setEditing(null)}><Plus size={16}/>上传案例</button>
          {submissions}
        </div>
      </>}
      options={[{value:'',label:'全部'},...groupTags.map(tag=>({value:tag,label:tag}))]}
      value={activeTag} onChange={value=>setActiveTag(value===activeTag?'':value)} query={search} onQueryChange={setSearch}
      searchLabel="搜索案例" placeholder="搜索案例、工具、提示词…"
      resultLabel={`已加载 ${visibleWorks.length} / ${catalogTotal} 个案例`} onClear={clearFilters}
      selected={[search&&{label:`搜索：${search}`,onRemove:()=>setSearch('')},activeTag&&{label:activeTag,onRemove:()=>setActiveTag('')}].filter(Boolean)}
    /> : <section className="community-discovery" aria-label="搜索和筛选案例">
      <label className="community-search"><MagnifyingGlass size={19} /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="搜索案例名称、创作者、方法或工具" aria-label="搜索案例" />{search && <button onClick={() => setSearch("")} aria-label="清除搜索"><X size={17} /></button>}</label>
      <div className="community-filter-row"><span>分类</span><div className="community-filter-tabs" role="tablist" aria-label="案例标签大类">{Object.keys(EMPTY_LABEL_GROUPS).map(group => <button key={group} role="tab" aria-selected={activeGroup === group} className={activeGroup === group ? "is-active" : ""} onClick={() => { setActiveGroup(group); setActiveTag(""); }}>{group}</button>)}</div></div>
      <div className="community-filter-row community-filter-row--tags"><span>{activeGroup}标签</span><div className="community-filter-chips" aria-label={`${activeGroup}分类标签`}><button className={!activeTag ? "is-active" : ""} aria-pressed={!activeTag} onClick={() => setActiveTag("")}>全部</button>{groupTags.map(tag => <button key={tag} className={activeTag === tag ? "is-active" : ""} aria-pressed={activeTag === tag} onClick={() => setActiveTag(activeTag === tag ? "" : tag)}>{tag}</button>)}{!groupTags.length && <small className="community-no-tags">此类暂无标签</small>}</div></div>
      <div className="community-results" aria-live="polite">{search || activeTag ? `找到 ${catalogTotal} 个案例` : `共 ${catalogTotal} 个案例`}<span> · 封面、创作者与分类标签一目了然</span></div>
    </section>}

    <CommunityCaseCatalog
      variant={variant}
      works={visibleWorks}
      loading={loading || catalogLoading}
      hasMore={catalogHasMore}
      loadingMore={loadingMore || catalogLoading}
      pageError={pageError}
      onLoadMore={loadNextPage}
      onOpen={openWork}
      hasFilters={hasFilters}
      onClear={clearFilters}
    />
    </div>
    {editor}
  </>;
}
function CommunityCaseCatalog({ variant, works, loading, onOpen, hasFilters, onClear, hasMore, loadingMore, pageError, onLoadMore }) {
  const sentinel = useRef(null);
  useEffect(() => {
    if (!hasMore || loadingMore || pageError || !sentinel.current || !('IntersectionObserver' in window)) return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) onLoadMore();
    }, {rootMargin:'200px'});
    observer.observe(sentinel.current);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, pageError, onLoadMore]);
  return <section id="case-catalog" className="community-case-catalog" aria-label="案例列表">
    {works.length ? (
      variant === 'morph' ? (
        <div className="morph-case-grid">
          {works.map(work => <MorphCaseCard key={work.id} work={work} onOpen={onOpen}/>)}
        </div>
      ) : (
        <div className="work-grid">
          {works.map(work => <article className="work-card" key={work.id}>
            <div className="work-preview">{work.previewUrl ? <img src={work.previewUrl} alt={`${work.title}封面`} loading="lazy" decoding="async"/> : <WorkVisualFallback work={work} compact/>}</div>
            <div className="work-card__body">
              <small>{work.creators?.join("、") || work.author || "匿名创作者"}</small>
              <h3>{work.title}</h3>
              <div className="case-labels">
                <span className="case-collection-tag" data-collection={work.collection}>{caseCollectionLabel(work)}</span>
                {workLabels(work).slice(0,4).map(label => <span key={label}>{label}</span>)}
              </div>
              <div className="work-card__footer">
                <div className="work-card__stats"><span><Heart/> {work.likeCount ?? 0}</span><span><BookmarkSimple/> {work.favoriteCount ?? 0}</span></div>
                <button disabled={loading} onClick={()=>onOpen(work)}>查看案例 <ArrowRight size={16}/></button>
              </div>
            </div>
          </article>)}
        </div>
      )
    ) : (
      <div className="community-empty">
        <MagnifyingGlass size={26}/>
        <strong>{hasFilters ? "没有匹配的案例" : "暂无案例"}</strong>
        <p>{hasFilters ? "试试其他关键词或分类标签。" : "案例发布后将在这里展示。"}</p>
        {hasFilters && <button onClick={onClear}>清除筛选条件</button>}
      </div>
    )}
    {hasMore && <div ref={sentinel} className="community-load-more" aria-live="polite">
      {pageError && <p role="alert">下一批案例加载失败。{pageError}</p>}
      <button type="button" className="button secondary" disabled={loadingMore} onClick={onLoadMore}>{loadingMore?<><span className="page-loading__spinner" aria-hidden="true"/>正在加载…</>:pageError?'重试加载':'加载更多案例'}</button>
    </div>}
  </section>;
}
function statusName(status) { return { draft: "草稿", pending: "审核中", approved: "已发布", rejected: "已驳回", archived: "已归档" }[status] ?? status; }
function reviewActionName(action) { return { submit: "提交审核", approve: "审核通过", publish: "直接发布", reject: "驳回修改", archive: "移入回收站", restore: "恢复至草稿" }[action] ?? action; }
function formatReviewDate(value) { const date = new Date(value); return Number.isNaN(date.getTime()) ? "时间未知" : new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(date); }
const handoffCaseCategories = ['服装与时尚','产品设计','品牌视觉','工艺与装置','信息设计','空间与景观','动画与影像'];
const caseGroupLabels = { 大类: "作品领域", 设计类: "设计方法", 使用工具类: "创作工具", 艺术类: "艺术方向" };
const EMPTY_LABEL_GROUPS = { 大类: [], 设计类: [], 使用工具类: [], 艺术类: [] };
function workLabelGroups(work) { return { 大类: [work.discipline].filter(Boolean), 设计类: work.methods ?? [], 使用工具类: work.tools ?? [], 艺术类: (work.tags ?? []).map(tag => typeof tag === "string" ? tag : tag.name).filter(Boolean) }; }
function workLabels(work) { return [...new Set(Object.values(workLabelGroups(work)).flat())]; }
function WorkVisualFallback({ work, compact = false }) {
  return <div className={`work-visual-fallback ${compact ? "work-visual-fallback--compact" : ""}`}><ImageSquare size={compact ? 36 : 58} /><span>{work.discipline || "艺术创作"}</span><strong>{work.title}</strong><small>作品封面待补充</small></div>;
}
function recommendWorks(works) {
  const signals = works.filter((work) => work.liked || work.favorited);
  const disciplines = new Set(signals.map((work) => work.discipline));
  const terms = new Set(signals.flatMap((work) => [...(work.methods ?? []), ...(work.tools ?? [])]).map((item) => item.toLowerCase()));
  const personalized = signals.length > 0;
  const items = works.filter((work) => !work.favorited).map((work) => {
    const matches = [...(work.methods ?? []), ...(work.tools ?? [])].filter((item) => terms.has(item.toLowerCase())).length;
    const disciplineMatch = disciplines.has(work.discipline);
    const popularity = Math.min(12, Number(work.likeCount ?? 0) + Number(work.favoriteCount ?? 0) * 2);
    return { ...work, score: (disciplineMatch ? 18 : 0) + matches * 7 + popularity, reason: disciplineMatch ? "同类创作方向" : matches ? "与你常看的工具相近" : "社区热门案例" };
  }).sort((left, right) => right.score - left.score || String(right.publishedAt).localeCompare(String(left.publishedAt))).slice(0, 3);
  return { items, personalized };
}
function ImageViewer({ image, assets = [], onChange, onClose }) {
  const images = assets.filter(asset => asset.asset_type === "image").map(asset => ({ url: asset.url, fileName: asset.file_name, alt: asset.alt_text }));
  if (!images.some(item => item.url === image.url)) images.unshift(image);
  const index = images.findIndex(item => item.url === image.url);
  // 共用 body Portal 看图器，避免固定定位被 route-transition 的 transform 限制。
  return <ImageLightbox src={image.url} fileName={image.fileName} alt={image.alt} variant="gallery"
    gallery={{ index, count: images.length, onPrevious: index > 0 ? () => onChange(images[index - 1]) : null, onNext: index < images.length - 1 ? () => onChange(images[index + 1]) : null }} onClose={onClose} />;
}
function ReportDialog({ target, onClose, onSubmit }) {
  const [reason, setReason] = useState("other");
  const [description, setDescription] = useState("");
  const root=useRef(null),[sending,setSending]=useState(false);
  const close=useRef({onClose,sending});close.current={onClose,sending};
  const stableClose=useRef(()=>{if(!close.current.sending)close.current.onClose();});
  useDialogFocus(root,stableClose.current);
  return createPortal(<div ref={root} className="case-image-viewer" role="dialog" aria-modal="true" aria-labelledby="report-dialog-title"><button className="case-image-viewer__backdrop" disabled={sending} onClick={stableClose.current} aria-label="关闭举报" tabIndex={-1}/><form className="report-dialog" onSubmit={async event => { event.preventDefault(); if(sending)return;setSending(true);try{await onSubmit({ reason, description });}finally{setSending(false);} }}><h3 id="report-dialog-title">举报{target.label}</h3><label>举报类型<select value={reason} onChange={event => setReason(event.target.value)}><option value="violence">暴力内容</option><option value="pornography">色情内容</option><option value="harassment">辱骂或骚扰</option><option value="spam">广告或垃圾信息</option><option value="other">其他问题</option></select></label><label>说明<textarea required minLength={2} maxLength={1000} value={description} onChange={event => setDescription(event.target.value)} placeholder="请简要说明举报原因" /></label><div><button type="button" disabled={sending} onClick={stableClose.current}>取消</button><button type="submit" disabled={sending}>{sending?'正在提交…':'提交举报'}</button></div></form></div>,document.body);
}
