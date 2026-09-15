import { useEffect, useState } from "react";
import { getWork } from "./services/adminApi.js";
import { CaseStoryView } from "./CaseStoryView.jsx";
import "./case-story.css";
export function CaseReviewContent({ workId }) {
  const [work,setWork] = useState(null);
  const [error,setError] = useState("");
  useEffect(() => { let active=true; setWork(null); setError(""); getWork(workId).then(value => { if(active)setWork(value); }).catch(failure => { if(active)setError(failure.message); }); return () => { active=false; }; },[workId]);
  if(error)return <p role="alert">案例正文加载失败：{error}。请重新打开详情核对后再审核。</p>;
  if(!work)return <p>正在加载案例正文与授权说明…</p>;
  return <section><h3>案例正文与署名</h3><p>{work.summary}</p><p>展示授权：{work.story.authorization === "confirmed" ? "上传者已确认" : "待确认"}</p><p>授权说明：{work.story.authorizationNote || "未提供"}</p><CaseStoryView work={work} /></section>;
}
