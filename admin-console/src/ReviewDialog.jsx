import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowClockwise, CaretLeft, CaretRight, Check, X } from "@phosphor-icons/react";
import { getWork } from "./services/adminApi.js";
import { CaseReviewContent, CaseReviewChecks } from "./CaseReviewContent.jsx";
import { canDecideReview, reviewDate, reviewStatusLabels } from "./reviewPresentation.js";
import "./review-workspace.css";

export function ReviewDialog({ review, onClose, onDecision, onPrevious, onNext, position, total }) {
  const [notes, setNotes] = useState({});
  useEffect(() => { if (!review) setNotes({}); }, [review]);
  if (!review) return null;
  // 正文和滚动位置随投稿重置；未提交备注按作品保存到关闭，避免串入下一件。
  return <ReviewDetail key={review.id} {...{ review, onClose, onDecision, onPrevious, onNext, position, total }} note={notes[review.id] || ""} onNoteChange={value => setNotes(current => ({ ...current, [review.id]: value }))} />;
}

function ReviewDetail({ review, onClose, onDecision, onPrevious, onNext, position, total, note, onNoteChange }) {
  const [work, setWork] = useState(null), [error, setError] = useState(""), [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false), [noteError, setNoteError] = useState("");
  const dialogRef = useRef(null), closeRef = useRef(null), noteRef = useRef(null), busyRef = useRef(false);

  useEffect(() => {
    let active = true;
    setWork(null); setError("");
    getWork(review.id).then(value => { if (active) setWork(value); }).catch(failure => { if (active) setError(failure.message || "请求失败"); });
    return () => { active = false; };
  }, [review.id, attempt]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow, previousFocus = document.activeElement;
    document.body.style.overflow = "hidden"; closeRef.current?.focus();
    return () => { document.body.style.overflow = previousOverflow; if (previousFocus?.isConnected) previousFocus.focus?.({ preventScroll: true }); };
  }, []);

  useEffect(() => {
    const onKey = event => {
      // 图片预览或最终确认弹窗负责自己的按键，不关闭其背后的审核页。
      if (document.querySelector(".image-lightbox, .document-preview-dialog[open]")) return;
      const confirmation = document.querySelector(".feedback-dialog-layer");
      if (confirmation) {
        if (event.key === "Escape") { event.preventDefault(); confirmation.querySelector('[aria-label="取消操作"]')?.click(); }
        if (event.key === "Tab") {
          const buttons = [...confirmation.querySelectorAll('.feedback-dialog button:not([disabled])')];
          const first = buttons[0], last = buttons.at(-1), active = document.activeElement;
          if (first && (event.shiftKey ? active === first || !buttons.includes(active) : active === last || !buttons.includes(active))) { event.preventDefault(); (event.shiftKey ? last : first).focus(); }
        }
        return;
      }
      if (event.key === "Escape" && !busyRef.current) { event.preventDefault(); onClose(); }
      if (event.key === "Tab") {
        const controls = [...dialogRef.current.querySelectorAll('button:not([disabled]), a[href], textarea:not([disabled]), summary')].filter(el => el.getClientRects().length);
        const first = controls[0], last = controls.at(-1), active = document.activeElement;
        if (first && (event.shiftKey ? active === first || !controls.includes(active) : active === last || !controls.includes(active))) { event.preventDefault(); (event.shiftKey ? last : first).focus(); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const pending = review.status === "pending", ready = canDecideReview(review, work);
  const decide = async status => {
    if (!ready || busyRef.current) return;
    if (status === "rejected" && !note.trim()) { setNoteError("请填写具体修改原因，再退回作者修改。"); noteRef.current?.focus(); return; }
    const previousFocus = document.activeElement;
    busyRef.current = true; setBusy(true);
    try { await onDecision(review.id, status, note.trim()); }
    finally { busyRef.current = false; setBusy(false); if (previousFocus?.isConnected) requestAnimationFrame(() => previousFocus.focus?.({ preventScroll: true })); }
  };

  return createPortal(<div className="review-dialog-layer">
    <button type="button" className="review-dialog-scrim" tabIndex={-1} onClick={() => { if (!busyRef.current) onClose(); }} aria-label="关闭审核详情" />
    <section ref={dialogRef} className="review-dialog" role="dialog" aria-modal="true" aria-labelledby="review-dialog-title" aria-describedby="review-dialog-context">
      <header className="review-dialog-header">
        <div className="review-dialog-heading"><div><span className={`review-status is-${review.status}`}>{reviewStatusLabels[review.status] || review.status}</span><span className="review-kind">{review.kind}</span></div><h2 id="review-dialog-title">{review.title}</h2><p id="review-dialog-context">{review.author} · {review.department || "未填写院系"} · {reviewDate(review.submittedAt)} 提交</p></div>
        <div className="review-dialog-navigation"><span>{position + 1} / {total}</span><button type="button" disabled={!onPrevious || busy} onClick={onPrevious} aria-label="上一件作品"><CaretLeft size={20} /></button><button type="button" disabled={!onNext || busy} onClick={onNext} aria-label="下一件作品"><CaretRight size={20} /></button><button ref={closeRef} type="button" disabled={busy} onClick={onClose} aria-label="关闭审核工作区"><X size={22} /></button></div>
      </header>
      <div className="review-dialog-body" aria-busy={!work && !error}>
        {error ? <div className="review-detail-state" role="alert"><h3>作品资料加载失败</h3><p>{error}</p><p>请重新加载并核对完整资料，当前不能进行审核。</p><button type="button" onClick={() => setAttempt(value => value + 1)}><ArrowClockwise size={18} />重新加载</button></div> : !work ? <div className="review-detail-state" role="status">正在加载作品内容与授权资料…</div> : <>
          <main className="review-preview-column"><CaseReviewContent work={work} /><details className="review-card review-disclosure review-files"><summary>文件清单 · {review.assetLinks?.length || 0} 个</summary><div>{review.assetLinks?.map((asset, index) => <a key={asset.id} href={asset.url} target="_blank" rel="noopener noreferrer">{index + 1}. {asset.fileName}</a>)}</div></details></main>
          <aside className="review-verification-column" aria-label="审核资料与授权"><CaseReviewChecks work={work} review={review} />{pending && <label className="review-decision-note"><span>审核备注 <small>通过可选 · 驳回必填</small></span><textarea ref={noteRef} maxLength={1000} disabled={busy} value={note} onChange={event => { onNoteChange(event.target.value); setNoteError(""); }} aria-invalid={Boolean(noteError)} aria-describedby="review-note-help" placeholder="具体说明需要修改的内容，帮助作者完善作品。" /><small id="review-note-help" className={noteError ? "review-note-error" : ""}>{noteError || "最多 1000 字，备注将随审核结果同步给作者。"}</small></label>}</aside>
        </>}
      </div>
      <footer className="review-dialog-footer"><p>{pending ? (busy ? "正在确认审核操作…" : ready ? "请核对内容、署名与授权后作出决定。" : work ? "作品状态已变化，请关闭后刷新审核列表。" : "完整资料就绪后才可审核。") : `该作品${reviewStatusLabels[review.status] || "已处理"}，当前为只读查看。`}</p><div>{pending ? <><button type="button" className="review-reject" disabled={!ready || busy} onClick={() => decide("rejected")}>退回修改</button><button type="button" className="review-approve" disabled={!ready || busy} onClick={() => decide("approved")}><Check size={18} />通过并发布</button></> : <button type="button" onClick={onClose}>关闭详情</button>}</div></footer>
    </section>
  </div>, document.body);
}
