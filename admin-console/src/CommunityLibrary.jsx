import { useEffect, useState } from "react";
import { ArrowClockwise, ArrowLeft, ArrowRight, BookmarkSimple, ChatCircle, Flag, Heart, ImageSquare, MagnifyingGlass, PaperPlaneTilt, Plus, SpinnerGap, X } from "@phosphor-icons/react";
import { addWorkComment, getMyWorks, getWork, getWorkflows, getWorks, reportComment, reportWork, submitWork, toggleWorkReaction } from "./services/adminApi.js";
import { CaseStoryEditor } from "./CaseStoryEditor.jsx";
import { CaseStoryView } from "./CaseStoryView.jsx";
import "./case-story.css";

export function CommunityLibrary({ account, onNotice, onOpenWorkflow }) {
  const [works, setWorks] = useState([]);
  const [myWorks, setMyWorks] = useState([]);
  const [workflows, setWorkflows] = useState([]);
  const [selected, setSelected] = useState(null);
  const [editing, setEditing] = useState(undefined);
  const [activeImage, setActiveImage] = useState(null);
  const [reportTarget, setReportTarget] = useState(null);
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(false);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState("");
  const [search, setSearch] = useState("");
  const [activeTag, setActiveTag] = useState("");
  const [activeGroup, setActiveGroup] = useState("大类");
  const refresh = async (showLoading = false) => {
    if (showLoading) setCatalogLoading(true);
    setCatalogError("");
    try {
      const [catalog, mine, workflowCatalog] = await Promise.all([getWorks(), getMyWorks(), getWorkflows()]);
      setWorks(catalog.items ?? []); setMyWorks(mine.items ?? []); setWorkflows(workflowCatalog.items ?? []);
    } catch (error) { setCatalogError(error.message); throw error; }
    finally { if (showLoading) setCatalogLoading(false); }
  };
  useEffect(() => { refresh(true).catch(error => onNotice(error.message)); }, []);
  const openWork = async work => {
    setLoading(true);
    try { setSelected(await getWork(work.id)); }
    catch (error) { onNotice(error.message); }
    finally { setLoading(false); }
  };
  const react = async reaction => {
    try { await toggleWorkReaction(selected.id, reaction); setSelected(await getWork(selected.id)); }
    catch (error) { onNotice(error.message); }
  };
  const sendComment = async event => {
    event.preventDefault();
    if (!comment.trim()) return;
    try { await addWorkComment(selected.id, comment); setComment(""); setSelected(await getWork(selected.id)); }
    catch (error) { onNotice(error.message); }
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
  const groupTags = [...new Set(works.flatMap(work => workLabelGroups(work)[activeGroup] ?? []))].sort((left, right) => left.localeCompare(right, "zh-CN"));
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const visibleWorks = works.filter(work => {
    const labels = workLabels(work);
    const text = [work.title, work.summary, work.author, ...(work.creators ?? []), ...labels].filter(Boolean).join(" ").toLocaleLowerCase();
    return (!normalizedSearch || text.includes(normalizedSearch)) && (!activeTag || labels.includes(activeTag));
  });
  const editor = editing !== undefined && <CaseStoryEditor key={editing?.id ?? "new"} initial={editing} workflows={workflows} onNotice={onNotice} onClose={() => { setEditing(undefined); refresh().catch(error => onNotice(error.message)); }} onSaved={saved => { setEditing(undefined); setSelected(saved); refresh().catch(error => onNotice(error.message)); onNotice("草稿已保存，尚未提交审核或发布"); }} />;
  if (catalogLoading) return <section className="resource-load-state" aria-busy="true"><SpinnerGap size={32} className="spin" /><strong>正在加载案例社区</strong></section>;
  if (catalogError && !works.length && !myWorks.length) return <section className="resource-load-state resource-load-state--error"><ArrowClockwise size={31} /><strong>案例社区暂时无法加载</strong><p>{catalogError}</p><button onClick={() => refresh(true).catch(error => onNotice(error.message))}>重新加载</button></section>;
  if (selected) {
    const heroAsset = selected.assets?.find(asset => asset.asset_type === "image" && asset.url === selected.previewUrl) ?? selected.assets?.find(asset => asset.asset_type === "image");
    return <><section className="community-detail">
    <button className="learning-back" onClick={() => setSelected(null)}><ArrowLeft size={16} /> 返回案例社区</button>
    <div className="community-detail__hero">{selected.previewUrl ? <button className="case-image-button case-image-button--hero" onClick={() => setActiveImage({ url: selected.previewUrl, fileName: heroAsset?.file_name ?? selected.title, alt: selected.title })} aria-label={`查看并下载图片：${selected.title}`}><img src={selected.previewUrl} alt={selected.title} /></button> : <WorkVisualFallback work={selected} />}</div>
    <div className="community-detail__body">
      <header><div><span>{selected.discipline} · {statusName(selected.status)}</span><h2>{selected.title}</h2><p>{selected.creators?.join("、") || selected.author} · {selected.tags?.map(tag => tag.name).join(" / ") || "未添加标签"}</p></div>
        {selected.status === "approved" && <div><button aria-label="点赞案例" onClick={() => react("like")}><Heart weight={selected.liked ? "fill" : "bold"} /> {selected.likeCount}</button><button aria-label="收藏案例" onClick={() => react("favorite")}><BookmarkSimple weight={selected.favorited ? "fill" : "bold"} /> {selected.favoriteCount}</button></div>}
      </header>
      {editable && <div className="case-draft-actions"><button disabled={loading} onClick={() => setEditing(selected)}>编辑草稿／关联步骤图片</button><button disabled={loading} onClick={submit}>提交管理员审核</button><small>收集案例需先确认原作者和展示授权；保存不会自动发布。</small></div>}
      {selected.status === "rejected" && selected.latestRejection?.reason && <section className="case-review-feedback"><strong>审核意见 · {formatReviewDate(selected.latestRejection.createdAt)}</strong><p>{selected.latestRejection.reason}</p><small>修改并保存后，可再次提交审核；历史审核记录会保留。</small></section>}
      {selected.reviewHistory?.length > 0 && <details className="case-review-history"><summary>查看审核历史（{selected.reviewHistory.length}）</summary>{selected.reviewHistory.map((event, index) => <article key={`${event.action}-${event.createdAt}-${index}`}><strong>{reviewActionName(event.action)}</strong><time>{formatReviewDate(event.createdAt)}</time>{event.reason && <p>{event.reason}</p>}</article>)}</details>}
      <p className="community-summary">{selected.summary}</p>
      <CaseStoryView work={selected} onOpenImage={setActiveImage} />
      {!!selected.workflows?.length && <div className="same-workflow"><span>关联的教学工作流</span>{selected.workflows.map(workflow => <button key={workflow.id} onClick={() => onOpenWorkflow?.(workflow.id)}>查看「{workflow.name}」<ArrowRight size={15} /></button>)}</div>}
      {selected.status === "approved" && <><div className="community-report-row"><button onClick={() => setReportTarget({ type: "work", id: selected.id, label: selected.title })}><Flag size={16} /> 举报作品</button></div><section className="comment-section"><h3><ChatCircle size={20} /> 创作讨论</h3>{selected.comments?.map(item => <article key={item.id}><div><strong>{item.author}</strong><button className="comment-report" onClick={() => setReportTarget({ type: "comment", id: item.id, label: "这条评论" })}>举报</button></div><p>{item.content}</p></article>)}<form onSubmit={sendComment}><input maxLength={2000} value={comment} onChange={e => setComment(e.target.value)} aria-label="发表创作讨论" placeholder="写下你的建议或问题……" /><button aria-label="发表讨论"><PaperPlaneTilt /></button></form></section></>}
    </div>
  </section>{activeImage && <ImageViewer image={activeImage} onClose={() => setActiveImage(null)} />}{reportTarget && <ReportDialog target={reportTarget} onClose={() => setReportTarget(null)} onSubmit={submitReport} />}{editor}</>;
  }
  return <>
    <div className="community-actions"><div><strong>分享创作，也分享过程</strong><span>一项目一案例 · 保存草稿 → 预览 → 提交审核</span></div><button onClick={() => setEditing(null)}><Plus size={18} /> 新建案例草稿</button></div>
    {!!myWorks.length && <section className="my-submissions"><span>我的案例与草稿</span>{myWorks.map(work => <button disabled={loading} key={work.id} onClick={() => openWork(work)}><strong>{work.title}</strong><em className={`status-${work.status}`}>{statusName(work.status)}</em></button>)}</section>}
    <section className="community-discovery" aria-label="搜索和筛选案例">
      <label className="community-search"><MagnifyingGlass size={19} /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="搜索案例名称、创作者、方法或工具" aria-label="搜索案例" />{search && <button onClick={() => setSearch("")} aria-label="清除搜索"><X size={17} /></button>}</label>
      <div className="community-filter-row"><span>分类</span><div className="community-filter-tabs" role="tablist" aria-label="案例标签大类">
        {Object.keys(EMPTY_LABEL_GROUPS).map(group => <button key={group} role="tab" aria-selected={activeGroup === group} className={activeGroup === group ? "is-active" : ""} onClick={() => { setActiveGroup(group); setActiveTag(""); }}>{group}</button>)}
      </div></div>
      <div className="community-filter-row community-filter-row--tags"><span>{activeGroup}标签</span><div className="community-filter-chips" aria-label={`${activeGroup}分类标签`}>
        <button className={!activeTag ? "is-active" : ""} aria-pressed={!activeTag} onClick={() => setActiveTag("")}>全部</button>
        {groupTags.map(tag => <button key={tag} className={activeTag === tag ? "is-active" : ""} aria-pressed={activeTag === tag} onClick={() => setActiveTag(activeTag === tag ? "" : tag)}>{tag}</button>)}
        {!groupTags.length && <small className="community-no-tags">此类暂无标签</small>}
      </div></div>
      <div className="community-results" aria-live="polite">{search || activeTag ? `找到 ${visibleWorks.length} 个案例` : `共 ${works.length} 个案例`}<span> · 封面、创作者与分类标签一目了然</span></div>
    </section>
    {visibleWorks.length ? <section className="work-grid">{visibleWorks.map(work => <article className="work-card" key={work.id}>
      <div className="work-preview">{work.previewUrl ? <img src={work.previewUrl} alt={`${work.title}封面`} loading="lazy" /> : <WorkVisualFallback work={work} compact />}</div>
      <div className="work-card__body"><small>{work.creators?.join("、") || work.author || "匿名创作者"}</small><h3>{work.title}</h3>
        <div className="case-labels">{workLabels(work).slice(0, 4).map(label => <span key={label}>{label}</span>)}</div>
        <div className="work-card__footer"><div className="work-card__stats"><span><Heart /> {work.likeCount ?? 0}</span><span><BookmarkSimple /> {work.favoriteCount ?? 0}</span></div><button disabled={loading} onClick={() => openWork(work)}>查看案例 <ArrowRight size={16} /></button></div>
      </div>
    </article>)}</section> : <section className="community-empty"><MagnifyingGlass size={26} /><strong>{works.length ? "没有找到匹配的案例" : "暂时还没有已发布案例"}</strong><p>{works.length ? "试试其他关键词或分类标签。" : "可先创建草稿，补充成果与创作过程。"}</p>{(search || activeTag) && <button onClick={() => { setSearch(""); setActiveTag(""); }}>清除筛选条件</button>}</section>}
    {editor}
  </>;
}
function statusName(status) { return { draft: "草稿", pending: "审核中", approved: "已发布", rejected: "已驳回", archived: "已归档" }[status] ?? status; }
function reviewActionName(action) { return { submit: "提交审核", approve: "审核通过", reject: "驳回修改" }[action] ?? action; }
function formatReviewDate(value) { const date = new Date(value); return Number.isNaN(date.getTime()) ? "时间未知" : new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(date); }
const EMPTY_LABEL_GROUPS = { 大类: [], 设计类: [], 使用工具类: [], 艺术类: [] };
function workLabelGroups(work) { return { 大类: [work.discipline].filter(Boolean), 设计类: work.methods ?? [], 使用工具类: work.tools ?? [], 艺术类: (work.tags ?? []).map(tag => typeof tag === "string" ? tag : tag.name).filter(Boolean) }; }
function workLabels(work) { return [...new Set(Object.values(workLabelGroups(work)).flat())]; }
function WorkVisualFallback({ work, compact = false }) {
  return <div className={`work-visual-fallback ${compact ? "work-visual-fallback--compact" : ""}`}><ImageSquare size={compact ? 36 : 58} /><span>{work.discipline || "艺术创作"}</span><strong>{work.title}</strong><small>作品封面待补充</small></div>;
}
function ImageViewer({ image, onClose }) {
  return <div className="case-image-viewer" role="dialog" aria-modal="true" aria-label="图片预览">
    <button className="case-image-viewer__backdrop" onClick={onClose} aria-label="关闭图片预览" />
    <div className="case-image-viewer__content"><img src={image.url} alt={image.alt || image.fileName} /><div><span>{image.fileName}</span><a href={image.url} download>下载原图</a><button onClick={onClose}>关闭</button></div></div>
  </div>;
}
function ReportDialog({ target, onClose, onSubmit }) {
  const [reason, setReason] = useState("other");
  const [description, setDescription] = useState("");
  return <div className="case-image-viewer" role="dialog" aria-modal="true" aria-label="提交举报"><button className="case-image-viewer__backdrop" onClick={onClose} aria-label="关闭举报" /><form className="report-dialog" onSubmit={event => { event.preventDefault(); onSubmit({ reason, description }); }}><h3>举报{target.label}</h3><label>举报类型<select value={reason} onChange={event => setReason(event.target.value)}><option value="violence">暴力内容</option><option value="pornography">色情内容</option><option value="harassment">辱骂或骚扰</option><option value="spam">广告或垃圾信息</option><option value="other">其他问题</option></select></label><label>说明<textarea required minLength={2} maxLength={1000} value={description} onChange={event => setDescription(event.target.value)} placeholder="请简要说明举报原因" /></label><div><button type="button" onClick={onClose}>取消</button><button type="submit">提交举报</button></div></form></div>;
}
