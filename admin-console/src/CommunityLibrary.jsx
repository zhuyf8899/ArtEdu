import { useEffect, useState } from "react";
import { ArrowClockwise, ArrowLeft, ArrowRight, BookmarkSimple, ChatCircle, Heart, ImageSquare, PaperPlaneTilt, Plus, SpinnerGap } from "@phosphor-icons/react";
import { addWorkComment, getMyWorks, getWork, getWorkflows, getWorks, submitWork, toggleWorkReaction } from "./services/adminApi.js";
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
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(false);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState("");
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
  const submit = async () => {
    setLoading(true);
    try { setSelected(await submitWork(selected.id)); await refresh(); onNotice("已提交管理员审核，尚未公开发布"); }
    catch (error) { onNotice(error.message); }
    finally { setLoading(false); }
  };
  const editable = selected && myWorks.some(work => work.id === selected.id) && ["draft", "rejected"].includes(selected.status);
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
      <p className="community-summary">{selected.summary}</p>
      <CaseStoryView work={selected} onOpenImage={setActiveImage} />
      {!!selected.workflows?.length && <div className="same-workflow"><span>关联的教学工作流</span>{selected.workflows.map(workflow => <button key={workflow.id} onClick={() => onOpenWorkflow?.(workflow.id)}>查看「{workflow.name}」<ArrowRight size={15} /></button>)}</div>}
      {selected.status === "approved" && <section className="comment-section"><h3><ChatCircle size={20} /> 创作讨论</h3>{selected.comments?.map(item => <article key={item.id}><strong>{item.author}</strong><p>{item.content}</p></article>)}<form onSubmit={sendComment}><input maxLength={2000} value={comment} onChange={e => setComment(e.target.value)} aria-label="发表创作讨论" placeholder="写下你的建议或问题……" /><button aria-label="发表讨论"><PaperPlaneTilt /></button></form></section>}
    </div>
  </section>{activeImage && <ImageViewer image={activeImage} onClose={() => setActiveImage(null)} />}{editor}</>;
  }
  return <>
    <div className="community-actions"><div><strong>分享创作，也分享过程</strong><span>一项目一案例 · 保存草稿 → 预览 → 提交审核</span></div><button onClick={() => setEditing(null)}><Plus size={18} /> 新建案例草稿</button></div>
    {!!myWorks.length && <section className="my-submissions"><span>我的案例与草稿</span>{myWorks.map(work => <button disabled={loading} key={work.id} onClick={() => openWork(work)}><strong>{work.title}</strong><em className={`status-${work.status}`}>{statusName(work.status)}</em></button>)}</section>}
    <section className="work-grid">{works.map((work,index) => <article className="work-card" key={work.id}><div className={`work-preview work-preview--${index % 3}`}>{work.previewUrl ? <img src={work.previewUrl} alt={work.title} loading="lazy" /> : <WorkVisualFallback work={work} compact />}</div><div><small>{work.creators?.join("、") || work.author}</small><h3>{work.title}</h3><p>{work.summary}</p><div className="case-labels">{[...(work.methods ?? []),...(work.tools ?? [])].slice(0,4).map((label,i) => <span key={`${label}-${i}`}>{label}</span>)}</div><div className="work-card__stats"><span><Heart /> {work.likeCount ?? 0}</span><span><BookmarkSimple /> {work.favoriteCount ?? 0}</span></div><button disabled={loading} onClick={() => openWork(work)}>查看案例 <ArrowRight size={16} /></button></div></article>)}</section>
    {!works.length && <p>暂无已发布案例。可先创建草稿，补充成果与创作过程。</p>}
    {editor}
  </>;
}
function statusName(status) { return { draft: "草稿", pending: "审核中", approved: "已发布", rejected: "已驳回", archived: "已归档" }[status] ?? status; }
function WorkVisualFallback({ work, compact = false }) {
  return <div className={`work-visual-fallback ${compact ? "work-visual-fallback--compact" : ""}`}><ImageSquare size={compact ? 36 : 58} /><span>{work.discipline || "艺术创作"}</span><strong>{work.title}</strong><small>作品封面待补充</small></div>;
}
function ImageViewer({ image, onClose }) {
  return <div className="case-image-viewer" role="dialog" aria-modal="true" aria-label="图片预览">
    <button className="case-image-viewer__backdrop" onClick={onClose} aria-label="关闭图片预览" />
    <div className="case-image-viewer__content"><img src={image.url} alt={image.alt || image.fileName} /><div><span>{image.fileName}</span><a href={image.url} download>下载原图</a><button onClick={onClose}>关闭</button></div></div>
  </div>;
}
