import { CaseStoryView } from "./CaseStoryView.jsx";
import { useEffect, useRef, useState } from "react";
import { findCaseEditorialIssues } from "./caseEditorial.js";
import { safeCaseSourceUrl } from "./caseStory.js";
import "./case-story.css";

export function CaseReviewContent({ work }) {
  const [expanded, setExpanded] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const summaryRef = useRef(null);
  const summary = work.summary || "暂无作品简介";
  useEffect(() => {
    if (expanded) return;
    const element = summaryRef.current;
    const measure = () => setHasMore(element.scrollHeight > element.clientHeight + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [summary, expanded]);
  return <section className="review-case-content" aria-labelledby="review-content-title">
    <h3 id="review-content-title">作品内容</h3>
    <p ref={summaryRef} id="review-case-summary" className={`review-case-summary${expanded ? " is-expanded" : ""}`}>{summary}</p>
    {(hasMore || expanded) && <button type="button" className="review-summary-toggle" aria-expanded={expanded} aria-controls="review-case-summary" onClick={() => setExpanded(value => !value)}>{expanded ? "收起简介" : "展开完整简介"}</button>}
    <CaseStoryView work={work} showMeta={false} showSource={false} showNavigation={false} />
  </section>;
}

// 私有授权说明和编辑备注只放在审核资料区，不混入作者正文或公共详情。
export function CaseReviewChecks({ work, review }) {
  const story = work.story ?? {};
  const issues = [...new Set([...(review.editorialIssues ?? []), ...findCaseEditorialIssues(work).map(issue => issue.message)])];
  const source = safeCaseSourceUrl(story.sourceUrl), original = safeCaseSourceUrl(story.originalUrl);
  const processed=review.status!=='pending';
  const decision=work.reviewHistory?.find(event=>event.action===(review.status==='approved'?'approve':'reject'));
  const decidedAt=decision?.createdAt&&Number.isFinite(Date.parse(decision.createdAt))?new Date(decision.createdAt).toLocaleString('zh-CN'):'历史记录未提供时间';
  return <>
    {processed&&<section className="review-card"><h3>{review.status==='approved'?'人工审核已通过 · 发布已生效':'人工审核已退回'}</h3><p>{decision?.reviewer||'历史审核记录'} · {decidedAt}</p>{decision?.reason&&<p>{decision.reason}</p>}<p className="review-card-hint">以下机器状态与资料提示为历史核对信息，不表示当前仍在等待审核。</p></section>}
    <section className="review-card" aria-labelledby="review-facts-title">
      <h3 id="review-facts-title">资料核对</h3>
      <dl className="review-meta-list">
        <div><dt>原作者 / 团队</dt><dd>{story.creators?.join("、") || (story.origin === "platform" ? review.author : "待补充")}</dd></div>
        <div><dt>上传者</dt><dd>{review.author} · {review.department || "未填写院系"}</dd></div>
        <div><dt>创作来源</dt><dd>{({ platform: "ArtEdu 创作", collected: "收集案例", unspecified: "待补充" })[story.origin] || "待补充"}</dd></div>
        <div><dt>使用工具</dt><dd>{story.tools?.join("、") || "未填写"}</dd></div>
        <div><dt>创作方法</dt><dd>{story.methods?.join("、") || "未填写"}</dd></div>
        <div><dt>生成模型</dt><dd>{review.model}</dd></div>
        <div><dt>{processed?'历史机器检测':'内容检测'}</dt><dd><span className="review-check-state">{review.machineStatus}</span></dd></div>
      </dl>
      {!!issues.length && (processed?<details className="review-disclosure"><summary>历史资料提示 · {issues.length} 项</summary><p>保留原检测提示供回看；当前发布结论见上方人工审核记录。</p><ul>{issues.map(issue=><li key={issue}>{issue}</li>)}</ul></details>:<div className="review-check-alert" role="note"><strong>需核对 {issues.length} 项</strong><ul>{issues.map(issue => <li key={issue}>{issue}</li>)}</ul></div>)}
    </section>
    <section className="review-card" aria-labelledby="review-rights-title">
      <h3 id="review-rights-title">署名与展示授权 <span className={`review-status ${story.authorization === "confirmed" ? "is-approved" : "is-pending"}`}>{story.authorization === "confirmed" ? "已确认" : "待确认"}</span></h3>
      <p className="review-card-hint">{story.authorization === "confirmed" ? "上传者已确认展示授权，请核对说明及来源。" : "上传者尚未确认展示授权，请进一步核实。"}</p>
      <details className="review-disclosure"><summary>查看授权说明</summary><p>{story.authorizationNote || "未提供授权说明"}</p></details>
      {(source || original || story.exhibitionName) && <div className="review-source-links"><span>{[story.exhibitionName, story.exhibitionYear].filter(Boolean).join(" · ")}</span>{source && <a href={source} target="_blank" rel="noopener noreferrer">{story.sourceName || "来源网站"} ↗</a>}{original && <a href={original} target="_blank" rel="noopener noreferrer">查看原作 ↗</a>}</div>}
      {story.editorialNote && <details className="review-disclosure"><summary>编辑备注 · 不对读者公开</summary><p>{story.editorialNote}</p></details>}
    </section>
    <details className="review-card review-disclosure"><summary>生成提示与投稿信息</summary><p>{review.prompt || "未记录生成提示词"}</p><small className="review-full-id">投稿编号：{review.id}</small></details>
  </>;
}
