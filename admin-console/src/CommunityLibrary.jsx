import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, BookmarkSimple, ChatCircle, CheckCircle, Heart, ImageSquare, PaperPlaneTilt, Plus, X } from "@phosphor-icons/react";
import { addWorkComment, createWork, getMyWorks, getWork, getWorkflows, getWorks, submitWork, toggleWorkReaction, uploadWorkAsset } from "./services/adminApi.js";

const emptyForm = { title: "", summary: "", discipline: "视觉传达", tags: "", workflowId: "" };

export function CommunityLibrary({ onNotice }) {
  const [works, setWorks] = useState([]);
  const [myWorks, setMyWorks] = useState([]);
  const [workflows, setWorkflows] = useState([]);
  const [selected, setSelected] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [file, setFile] = useState(null);
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    const [catalog, mine, workflowCatalog] = await Promise.all([getWorks(), getMyWorks(), getWorkflows()]);
    setWorks(catalog.items ?? []);
    setMyWorks(mine.items ?? []);
    setWorkflows(workflowCatalog.items ?? []);
  };

  useEffect(() => { refresh().catch((error) => onNotice(error.message)); }, []);

  const openWork = async (work) => {
    setLoading(true);
    try { setSelected(await getWork(work.id)); }
    catch (error) { onNotice(error.message); }
    finally { setLoading(false); }
  };

  const publish = async (event) => {
    event.preventDefault();
    if (!file) { onNotice("请选择一个 PNG、JPEG、WebP 或 PDF 文件"); return; }
    setLoading(true);
    try {
      const work = await createWork({
        title: form.title,
        summary: form.summary,
        discipline: form.discipline,
        workflowIds: form.workflowId ? [form.workflowId] : [],
        tagNames: form.tags.split(/[，,]/).map((tag) => tag.trim()).filter(Boolean),
      });
      await uploadWorkAsset(work.id, file);
      await submitWork(work.id);
      setForm(emptyForm);
      setFile(null);
      setShowForm(false);
      await refresh();
      onNotice("作品已提交审核，可在“我的投稿”查看状态");
    } catch (error) {
      onNotice(error.message || "文件提交失败");
    } finally {
      setLoading(false);
    }
  };

  const react = async (reaction) => {
    try {
      await toggleWorkReaction(selected.id, reaction);
      setSelected(await getWork(selected.id));
    } catch (error) { onNotice(error.message); }
  };

  const sendComment = async (event) => {
    event.preventDefault();
    if (!comment.trim()) return;
    try {
      await addWorkComment(selected.id, comment);
      setComment("");
      setSelected(await getWork(selected.id));
    } catch (error) { onNotice(error.message); }
  };

  const pendingCount = useMemo(() => myWorks.filter((work) => work.status === "pending").length, [myWorks]);

  if (selected) return <section className="community-detail">
    <button className="learning-back" onClick={() => setSelected(null)}><ArrowLeft size={16} weight="bold" /> 返回案例社区</button>
    <div className="community-detail__hero">{selected.previewUrl ? <img src={selected.previewUrl} alt={selected.title} /> : <ImageSquare size={64} weight="thin" />}</div>
    <div className="community-detail__body"><header><div><span>{selected.discipline}</span><h2>{selected.title}</h2><p>{selected.author} · {selected.tags?.map((tag) => tag.name).join(" / ") || "未添加标签"}</p></div><div><button className={selected.liked ? "is-active" : ""} onClick={() => react("like")}><Heart weight={selected.liked ? "fill" : "bold"} /> {selected.likeCount}</button><button className={selected.favorited ? "is-active" : ""} onClick={() => react("favorite")}><BookmarkSimple weight={selected.favorited ? "fill" : "bold"} /> {selected.favoriteCount}</button></div></header><p className="community-summary">{selected.summary}</p>
      {selected.workflows?.length > 0 && <div className="same-workflow"><span>// 使用的工作流</span>{selected.workflows.map((workflow) => <strong key={workflow.id}>{workflow.name}</strong>)}</div>}
      <section className="comment-section"><h3><ChatCircle size={20} /> 创作讨论</h3>{selected.comments?.map((item) => <article key={item.id}><strong>{item.author}</strong><p>{item.content}</p></article>)}<form onSubmit={sendComment}><input value={comment} onChange={(event) => setComment(event.target.value)} placeholder="写下你的建议或问题……" /><button><PaperPlaneTilt weight="fill" /></button></form></section>
    </div>
  </section>;

  return <>
    <div className="community-actions"><div><strong>案例投稿与审核</strong><span>当前有 {pendingCount} 项作品等待审核</span></div><button onClick={() => setShowForm(true)}><Plus size={17} weight="bold" /> 发布作品</button></div>
    {myWorks.length > 0 && <section className="my-submissions"><span>// 我的投稿</span>{myWorks.map((work) => <button key={work.id} onClick={() => openWork(work)}><strong>{work.title}</strong><em className={`status-${work.status}`}>{statusName(work.status)}</em></button>)}</section>}
    <section className="work-grid">{works.map((work, index) => <article className="work-card" key={work.id}><div className={`work-preview work-preview--${index % 3}`}>{work.previewUrl ? <img src={work.previewUrl} alt={work.title} /> : <><span>{work.discipline}</span><ImageSquare size={44} weight="thin" /></>}</div><div><small>{work.author}</small><h3>{work.title}</h3><p>{work.summary}</p><div className="work-card__stats"><span><Heart /> {work.likeCount ?? 0}</span><span><BookmarkSimple /> {work.favoriteCount ?? 0}</span></div><button disabled={loading} onClick={() => openWork(work)}>查看案例 <ArrowRight size={16} weight="bold" /></button></div></article>)}</section>
    {showForm && <div className="publish-layer"><button className="publish-scrim" onClick={() => setShowForm(false)} aria-label="关闭" /><form className="publish-form" onSubmit={publish}><header><div><span>// SUBMIT YOUR WORK</span><h2>发布作品</h2></div><button type="button" onClick={() => setShowForm(false)}><X size={20} /></button></header><label>作品名称<input required minLength="2" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label><label>作品说明<textarea required minLength="2" value={form.summary} onChange={(event) => setForm({ ...form, summary: event.target.value })} /></label><div className="publish-form__row"><label>学科分类<input required value={form.discipline} onChange={(event) => setForm({ ...form, discipline: event.target.value })} /></label><label>使用的工作流<select value={form.workflowId} onChange={(event) => setForm({ ...form, workflowId: event.target.value })}><option value="">未使用工作流</option>{workflows.map((workflow) => <option key={workflow.id} value={workflow.id}>{workflow.name}</option>)}</select></label></div><label>作品文件<input required type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /><small>仅接受 PNG、JPEG、WebP 或 PDF，最大 10 MB；服务端会校验实际文件类型，不接受外部链接。</small></label><label>标签<input placeholder="AI 设计，传统纹样，UI 创作" value={form.tags} onChange={(event) => setForm({ ...form, tags: event.target.value })} /></label><button className="publish-submit" disabled={loading}><CheckCircle size={18} weight="fill" /> {loading ? "正在提交…" : "提交管理员审核"}</button></form></div>}
  </>;
}

function statusName(status) { return { draft: "草稿", pending: "审核中", approved: "已发布", rejected: "已驳回", archived: "已归档" }[status] ?? status; }
