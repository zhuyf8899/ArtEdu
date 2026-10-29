import { useEffect, useMemo, useRef, useState } from "react";
import {createPortal} from 'react-dom';
import { ArrowClockwise, ArrowLeft, ArrowRight, BookmarkSimple, ChatCircle, Flag, Heart, ImageSquare, MagnifyingGlass, PaperPlaneTilt, Plus, SpinnerGap, X } from "@phosphor-icons/react";
import { addWorkComment, getMyWorks, getWork, getWorkflows, getWorks, reportComment, reportWork, submitWork, toggleWorkReaction, setWorkCollection } from "./services/adminApi.js";
import { CaseStoryEditor } from "./CaseStoryEditor.jsx";
import { CaseStoryView } from "./CaseStoryView.jsx";
import { ImageLightbox } from "./ImageLightbox.jsx";
import { CASE_COLLECTIONS, splitCommunityCollections } from "./communityCollections.js";
import "./case-story.css";
import { MorphPageBanner, MorphCaseCard } from './morph/MorphCatalog.jsx';
import { CatalogControls } from './morph/CatalogControls.jsx';
import { loadCommunityCatalog, mergeWorkRecord } from './communityData.js';
import { returnContext, withReturnTarget } from './resourceContext.js';
import { useScopedViewState } from './useScopedViewState.js';
import { useDialogFocus } from './useDialogFocus.js';

export function CommunityLibrary({ account, onNotice, onOpenWorkflow, onNavigate, initialWorkId = '', variant = 'classic' }) {
  const [works, setWorks] = useState([]);
  const [myWorks, setMyWorks] = useState([]);
  const [workflows, setWorkflows] = useState([]);
  const [selected, setSelected] = useState(null);
  const [editing, setEditing] = useState(undefined);
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
  const [search, setSearch] = useScopedViewState(account.id+":community:search","");
  const [activeTag, setActiveTag] = useScopedViewState(account.id+":community:tag","");
  const [activeGroup, setActiveGroup] = useScopedViewState(account.id+":community:group","大类");
  // 轻量、可解释的本地排序：优先复用用户已点赞/收藏作品的学科、工具与方法，
  // 新用户则退化为社区互动与发布时间，不需要画像上传或外部追踪。
  const recommendations = useMemo(() => recommendWorks(works), [works]);
  const refresh = async (showLoading = false) => {
    const requestId=++catalogRequest.current;
    if (showLoading) setCatalogLoading(true);
    setCatalogError("");
    try {
      const data=await loadCommunityCatalog({catalog:getWorks,mine:getMyWorks,workflows:getWorkflows});
      if(requestId!==catalogRequest.current) return;
      setWorks(data.works); setMyWorks(data.myWorks); setWorkflows(data.workflows); setSupportError(data.supportError);
    } catch (error) { if(requestId===catalogRequest.current) {setCatalogError(error.message); throw error;} }
    finally { if(requestId===catalogRequest.current) setCatalogLoading(false); }
  };
  useEffect(() => { refresh(true).catch(error => onNotice(error.message)); return()=>{catalogRequest.current++;}; }, []);
  useEffect(() => {
    // 分享同一社区页面的作品链接；仅请求指定作品，权限仍由 API 检查。
    setSelected(null); setActiveImage(null); setReportTarget(null); setComment(''); setDetailError('');
    if (!initialWorkId) { setLoading(false); return; }
    let active = true;
    setLoading(true);
    getWork(encodeURIComponent(initialWorkId)).then(work => { if (active) setSelected(work); }).catch(error => { if (active) { setDetailError(error.message); onNotice(error.message); } }).finally(() => { if(active) setLoading(false); });
    return () => { active = false; };
  }, [initialWorkId, detailRetry]);
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
    setLoading(true);
    try { setSelected(await submitWork(selected.id)); await refresh(); onNotice("已提交管理员审核，尚未公开发布"); }
    catch (error) { onNotice(error.message); }
    finally { setLoading(false); }
  };
  const editable = selected && myWorks.some(work => work.id === selected.id) && ["draft", "rejected"].includes(selected.status);
  const canCurate = account?.roles?.some(role => ["admin", "operator"].includes(role));
  const changeCollection = async collection => {
    if (collectionBusy || !selected || !canCurate) return;
    setCollectionBusy(true);
    try { await setWorkCollection(selected.id, collection); setSelected(await getWork(selected.id)); await refresh(); onNotice(`已移至${CASE_COLLECTIONS[collection]}`); }
    catch (error) { onNotice(error.message); }
    finally { setCollectionBusy(false); }
  };
  const groupTags = [...new Set(works.flatMap(work => workLabelGroups(work)[activeGroup] ?? []))].sort((left, right) => left.localeCompare(right, "zh-CN"));
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const visibleWorks = works.filter(work => {
    const labels = workLabels(work);
    const text = [work.title, work.summary, work.author, ...(work.creators ?? []), ...labels].filter(Boolean).join(" ").toLocaleLowerCase();
    return (!normalizedSearch || text.includes(normalizedSearch)) && (!activeTag || labels.includes(activeTag));
  });
  const collections = splitCommunityCollections(visibleWorks);
  const collectionTotals = splitCommunityCollections(works);
  const hasFilters = Boolean(search || activeTag);
  const clearFilters = () => { setSearch(""); setActiveTag(""); };
  const editor = editing !== undefined && <CaseStoryEditor key={editing?.id ?? "new"} initial={editing} workflows={workflows} onNotice={onNotice} onClose={() => { setEditing(undefined); refresh().catch(error => onNotice(error.message)); }} onSaved={saved => { setEditing(undefined); if(onNavigate) void openWork(saved); else setSelected(saved); refresh().catch(error => onNotice(error.message)); onNotice("草稿已保存，尚未提交审核或发布"); }} />;
  if (initialWorkId && !selected) return <section className="resource-load-state" aria-busy={loading||!detailError}><strong>{detailError?'案例暂时无法打开':'正在打开案例…'}</strong>{detailError&&<><p role="alert">{detailError}</p><button onClick={()=>setDetailRetry(value=>value+1)}>重新加载案例</button></>}<button onClick={returnToCatalog}>{context.to?context.label:'返回案例社区'}</button></section>;
  if (catalogLoading) return <section className="resource-load-state" aria-busy="true"><SpinnerGap size={32} className="spin" /><strong>正在加载案例社区</strong></section>;
  if (catalogError && !works.length && !myWorks.length) return <section className="resource-load-state resource-load-state--error"><ArrowClockwise size={31} /><strong>案例社区暂时无法加载</strong><p>{catalogError}</p><button onClick={() => refresh(true).catch(error => onNotice(error.message))}>重新加载</button></section>;
  if (selected) {
    const exhibition = selected.story?.origin === "collected" && selected.story?.displayStyle === "exhibition";
    const heroAsset = selected.assets?.find(asset => asset.asset_type === "image" && asset.url === selected.previewUrl) ?? selected.assets?.find(asset => asset.asset_type === "image");
    return <><section className={`community-detail${exhibition ? " community-detail--exhibition" : ""}`}>
    <button className="learning-back" onClick={returnToCatalog}><ArrowLeft size={16} /> {context.to ? context.label : '返回案例社区'}</button>
    {supportError&&<p className="catalog-inline-warning" role="status">{supportError}。<button onClick={()=>refresh().catch(error=>onNotice(error.message))}>重新同步</button></p>}
    <div className="community-detail__hero">{selected.previewUrl ? <button className="case-image-button case-image-button--hero" onClick={() => setActiveImage({ url: selected.previewUrl, fileName: heroAsset?.file_name ?? selected.title, alt: selected.title })} aria-label={`查看并下载图片：${selected.title}`}><img src={selected.previewUrl} alt={selected.title} /></button> : <WorkVisualFallback work={selected} />}</div>
    <div className="community-detail__body">
      <header><div><span className="community-detail__category">{selected.discipline} · {exhibition ? "外部艺术案例" : statusName(selected.status)}</span>{exhibition && <p className="community-detail__artist">{selected.creators?.join("、") || selected.author}</p>}<h2>{selected.title}</h2>{!exhibition && <p>{selected.creators?.join("、") || selected.author} · {selected.tags?.map(tag => tag.name).join(" / ") || "未添加标签"}</p>}{exhibition && <div className="case-labels">{selected.tags?.map(tag => <span key={tag.id ?? tag.name}>{tag.name}</span>)}</div>}</div>
        {selected.status === "approved" && <div aria-busy={interactionBusy}><button aria-label="点赞案例" aria-pressed={selected.liked} disabled={interactionBusy} onClick={() => react("like")}><Heart weight={selected.liked ? "fill" : "bold"} /> {selected.likeCount}</button><button aria-label="收藏案例" aria-pressed={selected.favorited} disabled={interactionBusy} onClick={() => react("favorite")}><BookmarkSimple weight={selected.favorited ? "fill" : "bold"} /> {selected.favoriteCount}</button></div>}
      </header>
      {canCurate && selected.status === "approved" && <div className="case-collection-control"><label>案例所属模块<select aria-label="案例所属模块" disabled={collectionBusy} value={selected.collection ?? "community"} onChange={event => changeCollection(event.target.value)}>{Object.entries(CASE_COLLECTIONS).map(([value,label]) => <option value={value} key={value}>{label}</option>)}</select></label>{collectionBusy && <span role="status">正在保存…</span>}</div>}
      {editable && <div className="case-draft-actions"><button disabled={loading} onClick={() => setEditing(selected)}>编辑草稿／关联步骤图片</button><button disabled={loading} onClick={submit}>提交管理员审核</button><small>收集案例需先确认原作者和展示授权；保存不会自动发布。</small></div>}
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
    {variant === 'morph' && <MorphPageBanner title="案例社区" eyebrow="CASE COMMUNITY"><button type="button" className="button" onClick={()=>setEditing(null)}><Plus size={17}/> 新建案例草稿</button></MorphPageBanner>}
    <div className={variant === 'morph' ? 'container morph-community-catalog' : undefined}>
    {(supportError||catalogError)&&<p className="catalog-inline-warning" role="status">{catalogError||supportError}。可重试同步，不影响已加载案例的浏览。<button onClick={()=>refresh().catch(error=>onNotice(error.message))}>重新同步</button></p>}
    {variant !== 'morph' && <section className="learning-library-intro community-page-intro" aria-labelledby="community-page-title">
      <div className="learning-library-intro__copy">
        <p className="learning-library-intro__eyebrow">ARTEDU · COMMUNITY</p>
        <div className="learning-library-intro__title-row"><h1 id="community-page-title">案例社区</h1><span>{works.length} 个案例</span></div>
        <p>从精选艺术中获得灵感，在社区案例中交流创作方法。</p>
      </div>
      <button type="button" className="community-create-draft" onClick={() => setEditing(null)}><Plus size={18} weight="bold" /> 新建案例草稿</button>
    </section>}
    <nav className="community-module-links" aria-label="案例模块入口"><a href="#featured-art-cases">精选艺术案例<span>{collectionTotals["art-selection"].length}</span></a><a href="#community-cases">社区案例<span>{collectionTotals.community.length}</span></a></nav>
    {variant !== 'morph' && !!recommendations.length && <section className="community-recommendations"><header><div><small>// FOR YOU</small><h3>为你推荐</h3><p>{recommendations.personalized ? "根据你已点赞或收藏案例的方向排序" : "先从社区互动较高、较新的案例开始探索"}</p></div></header><div>{recommendations.items.map(work => <button key={work.id} disabled={loading} onClick={() => openWork(work)}>{work.previewUrl ? <img src={work.previewUrl} alt="" /> : <ImageSquare size={23} />}<span><strong>{work.title}</strong><small>{work.discipline} · {work.reason}</small></span><ArrowRight size={16} /></button>)}</div></section>}
    {variant === 'morph' ? <CatalogControls key={activeGroup} label="案例筛选"
      dimensions={<><span>分类维度</span><div role="group" aria-label="案例分类维度">{Object.keys(EMPTY_LABEL_GROUPS).map(group=><button type="button" key={group} aria-pressed={activeGroup===group} onClick={()=>{setActiveGroup(group);setActiveTag('');}}>{({大类:'作品领域',设计类:'设计方法',使用工具类:'创作工具',艺术类:'艺术方向'})[group]}</button>)}</div></>}
      options={[{value:'',label:'全部',count:works.length},...groupTags.map(tag=>({value:tag,label:tag,count:works.filter(work=>(workLabelGroups(work)[activeGroup]??[]).includes(tag)).length}))]}
      value={activeTag} onChange={value=>setActiveTag(value===activeTag?'':value)} query={search} onQueryChange={setSearch}
      searchLabel="搜索案例" placeholder="搜索案例、创作者、方法或工具"
      resultLabel={`${visibleWorks.length} / ${works.length} 个案例`} onClear={clearFilters}
      selected={[search&&{label:`搜索：${search}`,onRemove:()=>setSearch('')},activeTag&&{label:activeTag,onRemove:()=>setActiveTag('')}].filter(Boolean)}
    /> : <section className="community-discovery" aria-label="搜索和筛选案例">
      <label className="community-search"><MagnifyingGlass size={19} /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="搜索案例名称、创作者、方法或工具" aria-label="搜索案例" />{search && <button onClick={() => setSearch("")} aria-label="清除搜索"><X size={17} /></button>}</label>
      <div className="community-filter-row"><span>分类</span><div className="community-filter-tabs" role="tablist" aria-label="案例标签大类">{Object.keys(EMPTY_LABEL_GROUPS).map(group => <button key={group} role="tab" aria-selected={activeGroup === group} className={activeGroup === group ? "is-active" : ""} onClick={() => { setActiveGroup(group); setActiveTag(""); }}>{group}</button>)}</div></div>
      <div className="community-filter-row community-filter-row--tags"><span>{activeGroup}标签</span><div className="community-filter-chips" aria-label={`${activeGroup}分类标签`}><button className={!activeTag ? "is-active" : ""} aria-pressed={!activeTag} onClick={() => setActiveTag("")}>全部</button>{groupTags.map(tag => <button key={tag} className={activeTag === tag ? "is-active" : ""} aria-pressed={activeTag === tag} onClick={() => setActiveTag(activeTag === tag ? "" : tag)}>{tag}</button>)}{!groupTags.length && <small className="community-no-tags">此类暂无标签</small>}</div></div>
      <div className="community-results" aria-live="polite">{search || activeTag ? `找到 ${visibleWorks.length} 个案例` : `共 ${works.length} 个案例`}<span> · 封面、创作者与分类标签一目了然</span></div>
    </section>}

    <CommunityCaseModule variant={variant} id="featured-art-cases" title="精选艺术案例" description="平台精选的艺术作品，探索 AI 与艺术的多种表达。" works={collections["art-selection"]} total={collectionTotals["art-selection"].length} loading={loading} onOpen={openWork} hasFilters={hasFilters} onClear={clearFilters} />
    <CommunityCaseModule variant={variant} id="community-cases" title="社区案例" description="发现学习者与创作者的实践，交流成果与创作过程。" works={collections.community} total={collectionTotals.community.length} loading={loading} onOpen={openWork} hasFilters={hasFilters} onClear={clearFilters} />
    </div>
    {editor}
  </>;
}
function CommunityCaseModule({ id, title, description, works, total, loading, onOpen, hasFilters, onClear, variant }) {
  return <section id={id} className="community-case-module" aria-labelledby={`${id}-title`}>
    <header className="community-case-module__heading"><div><h2 id={`${id}-title`}>{title}<span>{hasFilters ? `${works.length} / ${total}` : total}</span></h2><p>{description}</p></div></header>
    {works.length ? variant === 'morph' ? <div className="morph-case-grid">{works.map(work=><MorphCaseCard key={work.id} work={work} onOpen={onOpen}/>)}</div> : <div className={`work-grid${id === "featured-art-cases" ? " work-grid--art-selection" : ""}`} data-single-card={works.length === 1}>{works.map(work => <article className="work-card" key={work.id}><div className="work-preview">{work.previewUrl ? <img src={work.previewUrl} alt={`${work.title}封面`} loading="lazy" /> : <WorkVisualFallback work={work} compact />}</div><div className="work-card__body"><small>{work.creators?.join("、") || work.author || "匿名创作者"}</small><h3>{work.title}</h3><div className="case-labels">{workLabels(work).slice(0, 4).map(label => <span key={label}>{label}</span>)}</div><div className="work-card__footer"><div className="work-card__stats"><span><Heart /> {work.likeCount ?? 0}</span><span><BookmarkSimple /> {work.favoriteCount ?? 0}</span></div><button disabled={loading} onClick={() => onOpen(work)}>查看案例 <ArrowRight size={16} /></button></div></div></article>)}</div> : <div className="community-empty"><MagnifyingGlass size={26} /><strong>{hasFilters ? "此模块暂无匹配案例" : `暂无${title}`}</strong><p>{hasFilters ? "试试其他关键词或分类标签。" : "案例发布后将在这里展示。"}</p>{hasFilters && <button onClick={onClear}>清除筛选条件</button>}</div>}
  </section>;
}
function statusName(status) { return { draft: "草稿", pending: "审核中", approved: "已发布", rejected: "已驳回", archived: "已归档" }[status] ?? status; }
function reviewActionName(action) { return { submit: "提交审核", approve: "审核通过", reject: "驳回修改", archive: "移入回收站", restore: "恢复至草稿" }[action] ?? action; }
function formatReviewDate(value) { const date = new Date(value); return Number.isNaN(date.getTime()) ? "时间未知" : new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(date); }
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
