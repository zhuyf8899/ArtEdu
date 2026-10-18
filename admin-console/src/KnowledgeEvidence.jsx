import { useMemo, useState } from "react";
import { ArrowRight, BookOpenText, CheckCircle, FlowArrow } from "@phosphor-icons/react";
import { buildKnowledgeEvidence, learningLabels } from "./learningBindings.js";

const states = { coverage: "课程涉及", not_started: "未开始", learning: "学习中", completed: "关联课时已完成" };
const lessonHref = (lesson) => `/learning?course=${encodeURIComponent(lesson.courseId)}&lesson=${encodeURIComponent(lesson.id)}`;

export function KnowledgeEvidence({ graph, source, onGoTo }) {
  const [showAll, setShowAll] = useState(false);
  const all = useMemo(() => buildKnowledgeEvidence(graph), [graph]);
  const points = source?.kind === "course" ? all.filter((point) => point.courses.some((course) => course.id === source.id) || point.lessons.some((lesson) => lesson.courseId === source.id))
    : source?.kind === "lesson" ? all.filter((point) => point.lessons.some((lesson) => lesson.id === source.id)) : all;
  const run = source?.kind === "run" ? graph.runs.find((item) => item.id === source.id) : null;
  const scoped = ["course", "lesson"].includes(source?.kind);
  const runs = run ? [run] : scoped ? graph.runs.filter((item) => points.some((point) => point.workflows.includes(item))
    || graph.lessons.some((lesson) => lesson.workflowId === item.workflowId && (source.kind === "course" ? lesson.courseId === source.id : lesson.id === source.id))) : graph.runs;
  const boundRuns = runs.filter((item) => learningLabels(item.learningBindings?.tools).length || learningLabels(item.learningBindings?.abilityGoals).length || learningLabels(item.learningBindings?.knowledgePoints).length);
  return <section className="knowledge-bindings" aria-label="知识与实践关联">
    <header><div><span className="knowledge-kicker">KNOWLEDGE & PRACTICE</span><h4>知识与实践关联</h4><p>来自课程与工作流的明确配置，可回看对应课时和作品；完成记录不等于能力认证。</p></div>{points.length > 6 && <button type="button" onClick={() => setShowAll((current) => !current)} aria-expanded={showAll}>{showAll ? "收起" : `查看全部 ${points.length} 项`}</button>}</header>
    {points.length ? <div className="knowledge-bindings__grid">{(showAll ? points : points.slice(0, 6)).map((point) => <article className={`knowledge-point is-${point.state}`} key={point.name}>
      <div className="knowledge-point__heading"><BookOpenText size={18} aria-hidden="true" /><h5>{point.name}</h5><span>{states[point.state]}</span></div>
      <p>{point.lessonCount ? `${point.completedCount} / ${point.lessonCount} 个关联课时完成` : "暂无关联课时"}</p>
      <details><summary>查看学习依据{point.submissions.length > 0 && <small> · {point.submissions.length} 件关联作品</small>}</summary>
        {point.lessons.map((lesson) => <button type="button" key={lesson.id} onClick={() => onGoTo(lessonHref(lesson))}><span>{lesson.title}<small>{Number(lesson.progressPercent) >= 100 ? "课时已完成，知识掌握待验证" : Number(lesson.progressPercent) > 0 ? `学习中 · ${lesson.progressPercent}%` : "未开始"}</small></span><ArrowRight size={15} /></button>)}
        {!point.lessonCount && point.courses.map((course) => <button type="button" key={course.id} onClick={() => onGoTo(`/learning?course=${encodeURIComponent(course.id)}`)}><span>{course.title}<small>课程配置范围，不是已学证据</small></span><ArrowRight size={15} /></button>)}
        {point.submissions.map((work, index) => <button type="button" key={`${work.workId}-${index}`} onClick={() => onGoTo("works")}><span>{work.title}<small>{work.lessonTitle} · 已提交</small></span><CheckCircle size={15} /></button>)}
      </details>
      {point.next && <button className="knowledge-point__next" type="button" onClick={() => onGoTo(lessonHref(point.next))}>继续：{point.next.title}<ArrowRight size={15} /></button>}
    </article>)}</div> : <p className="knowledge-bindings__empty">{all.length ? "此课时暂无关联知识点。" : "暂无知识关联。"}</p>}
    {boundRuns.length > 0 && <details className="knowledge-tools"><summary><FlowArrow size={17} /> 工作流的工具与能力目标 · {boundRuns.length} 条记录</summary>
      {boundRuns.map((item) => <article key={item.id}><strong>{item.workflowName}</strong><span>{item.status === "completed" ? "工作流已完成" : "工作流尚未完成"}</span>
        <dl>{[["knowledgePoints", "知识关联"], ["tools", "涉及工具"], ["abilityGoals", "能力目标"]].map(([key, title]) => <div key={key}><dt>{title}</dt><dd>{learningLabels(item.learningBindings?.[key]).join(" · ") || "未配置"}</dd></div>)}</dl>
        <button type="button" onClick={() => onGoTo(`/studio?workflow=${encodeURIComponent(item.workflowId)}&run=${encodeURIComponent(item.id)}`)}>回看本次实践<ArrowRight size={15} /></button>
      </article>)}
    </details>}
  </section>;
}
