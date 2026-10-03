import { useId, useMemo, useState } from "react";
import { ArrowRight, BookOpenText, Clock, ImageSquare, Lightbulb, NotePencil, Student } from "@phosphor-icons/react";
import { buildLearningFramework, buildLearningGraph, buildLearningOrbitContent } from "./learningGraphModel.js";
import { buildLearningPaths } from "./learningPathModel.js";
import { LearningPathCanvas } from "./LearningPathCanvas.jsx";
import { KnowledgeEvidence } from "./KnowledgeEvidence.jsx";
import "./LearningGraph.css";

const COLUMNS = [
  ["我的学习地图", BookOpenText, "课程路径"],
  ["我的能力画像", Student, "课时与练习"],
  ["我的工具轨迹", ImageSquare, "平台工作流"],
  ["我的成长记录", Clock, "笔记与作品"],
];
const STATUS = { skilled: "目标达成", good: "持续积累", basic: "已经开始", none: "暂无记录" };
const dateLabel = (value) => new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric" }).format(new Date(value));

export function LearningGraph({ data, onNavigate, onView }) {
  const graph = useMemo(() => buildLearningGraph(data), [data]);
  const framework = useMemo(() => buildLearningFramework(graph), [graph]);
  const contents = useMemo(() => buildLearningOrbitContent(graph, framework), [graph, framework]);
  const paths = useMemo(() => buildLearningPaths(graph, framework, contents), [graph, framework, contents]);
  const [selection, setSelection] = useState(null);
  const graphId = useId();
  const goTo = (action) => action?.startsWith("/") ? onNavigate(action) : action && onView(action);
  const next = framework.nextCell;
  const selectedStage = framework.stages.find((stage) => stage.id === selection?.stageId) ?? framework.currentStage;
  const selectedColumn = selection?.column ?? Math.max(0, selectedStage.cells.indexOf(next));
  const selectedCell = selectedStage.cells[Math.min(selectedColumn, 3)];
  const selectedContent = contents[selectedStage.id][Math.min(selectedColumn, 3)];
  const selectedRecommendation = paths[selectedStage.id].recommendation;
  const nextContent = next ? contents[framework.currentStage.id][framework.currentStage.cells.indexOf(next)] : null;
  const followingStage = framework.stages[framework.stages.indexOf(framework.currentStage) + 1];
  const detailId = `${graphId}-detail`;
  const actionLabel = (action) => action?.startsWith("/learning") ? "AI 讲堂" : action?.startsWith("/studio") ? "设计工具" : action === "notes" ? "学习笔记" : action === "plan" ? "学习计划" : "我的作品";

  return <div className="knowledge-page knowledge-page--framework knowledge-page--orbits">
    <section className="knowledge-orbits" aria-labelledby={`${graphId}-title`}>
      <header className="knowledge-orbits__heading"><div><span className="knowledge-kicker">01—04 / LEARNING JOURNEY</span><h3 id={`${graphId}-title`}>我的学习图谱</h3><p>圆内看具体课程、已学内容与创作记录；点击查看完整内容和下一步。</p></div><div className="knowledge-legend" aria-label="阶段进度颜色说明">{Object.entries(STATUS).map(([key, label]) => <span key={key}><i className={`knowledge-legend__dot is-${key}`} />{label}</span>)}</div></header>
      <div className="knowledge-orbits__annotations" aria-label="图谱板块注释">{COLUMNS.map(([label, Icon], column) => <span key={label}><Icon size={16} aria-hidden="true" /><span>{["左上", "上方", "下方", "中央大圆"][column]}<strong>{label.replace("我的", "")}</strong></span></span>)}<span><Lightbulb size={16} aria-hidden="true" /><span>右侧<strong>学习建议</strong></span></span></div>
      <LearningPathCanvas graph={graph} framework={framework} contents={contents} paths={paths} selectedStage={selectedStage} selectedColumn={selectedColumn} onSelect={setSelection} onGoTo={goTo} detailId={detailId} columns={COLUMNS} />
      {selectedColumn === 4 ? <div className="knowledge-orbits__detail knowledge-path__recommendation" id={detailId} role="region" aria-label="学习建议与推荐依据" aria-live="polite">
        <div><span className="knowledge-kicker">阶段 {selectedStage.number} · 学习建议</span><h4>{selectedRecommendation.title}</h4><p>{selectedRecommendation.text}</p></div>
        <button type="button" onClick={() => goTo(selectedRecommendation.action)}>开始学习<ArrowRight size={17} /></button>
        <section className="knowledge-path__reason"><h5>为什么推荐这一步？</h5><p>{selectedRecommendation.reason}</p><small>基于当前记录和阶段展示目标的规则推荐，不是 AI 测评或教师评分。</small></section>
      </div> : <div className={`knowledge-orbits__detail is-${selectedCell.state}`} id={detailId} role="region" aria-label="选中板块学习详情" aria-live="polite" aria-atomic="true">
        <div><span className="knowledge-kicker">阶段 {selectedStage.number} · {COLUMNS[selectedColumn][0]} · {selectedContent.recordLabel}</span><h4>{selectedContent.headline}</h4><p>{selectedContent.topic}</p></div>
        <div className="knowledge-orbits__detail-progress"><span>{STATUS[selectedCell.state]}</span><strong>{selectedCell.display ?? `${selectedCell.value} / ${selectedCell.target} ${selectedCell.unit}`}</strong></div>
        <button type="button" onClick={() => goTo(selectedContent.action)}>前往{actionLabel(selectedContent.action)}<ArrowRight size={17} /></button>
        <div className="knowledge-orbits__detail-body">
          <section><h5>学习与创作记录</h5>{selectedContent.records.length ? selectedContent.records.map((record, index) => <button className="knowledge-orbits__record-link" type="button" key={`${record.title}-${index}`} onClick={() => goTo(record.action)}><span><strong>{record.title}</strong><small>{record.detail}</small></span><ArrowRight size={15} /></button>) : <p>尚无对应记录，先从下一步开始。</p>}</section>
          <section><h5>已学内容 · 来自已完成课时</h5>{selectedContent.knowledge.length ? <ul>{selectedContent.knowledge.map((topic) => <li key={topic}>{topic}</li>)}</ul> : <p>{graph.lessons.length ? "此板块暂无已完成课时对应的知识内容。任务、笔记和工具记录不等同于知识掌握。" : "暂无已完成课时的内容记录，不会将已选课程或推荐内容标为已学。"}</p>}</section>
          <section className="knowledge-orbits__next"><h5>下一步学什么</h5><strong>{selectedContent.next.title}</strong><p>{selectedContent.next.text}</p><button type="button" onClick={() => goTo(selectedContent.next.action)}>开始下一步<ArrowRight size={15} /></button></section>
        </div>
      </div>}
      <KnowledgeEvidence graph={graph} source={selectedColumn === 4 ? null : selectedContent.source} onGoTo={goTo} />
      <p className="knowledge-framework__disclaimer">实线表示已有记录或明确配置的关联，虚线表示建议路径；“后续阶段”是路线规划，不表示已绑定课程或必须按顺序解锁。颜色表示累计记录目标，不是知识掌握或能力认证。已学内容来自已完成课时；工作流工具配置不等于外部工具使用。</p>
    </section>

    <section className="knowledge-guidance" aria-label="下一阶段建议">
      <div className="knowledge-guidance__lead"><span className="knowledge-kicker">NEXT STEP / 下一步</span><h3>{nextContent?.next.title ?? "继续拓展自己的艺术表达"}</h3><p>{nextContent?.next.text ?? "当前展示目标已达到。尝试新的课程、题材和工作流，持续拓展自己的方法。"}</p><button type="button" onClick={() => goTo(nextContent?.next.action ?? "/learning")}>{next ? "开始下一步" : "探索新课程"}<ArrowRight size={16} /></button></div>
      <div className="knowledge-guidance__reason"><strong>{followingStage ? `接下来：${followingStage.title}` : "持续学习与表达"}</strong><p>{next ? `先补齐「${framework.currentStage.title}」的「${next.title}」目标，目前为 ${next.display ?? `${next.value} / ${next.target} ${next.unit}`}。` : "四个方面都已有阶段记录，接下来可以选择自己感兴趣的方向继续深挖。"}{followingStage && `下一阶段重点：${followingStage.subtitle}。`}</p><span>推荐基于学习记录，不替代教师评价。</span></div>
    </section>

    <details className="knowledge-orbits__evidence"><summary>查看课程、工作流与成长足迹<span>展开真实学习记录</span></summary><div className="knowledge-evidence"><section><div className="knowledge-evidence__title"><BookOpenText size={19} /><strong>正在学习的课程</strong></div>{graph.courses.length ? graph.courses.slice(0, 3).map((course) => <button key={course.id} type="button" onClick={() => onNavigate(`/learning?course=${encodeURIComponent(course.id)}`)}><span>{course.title}<small>{course.completedLessons} / {course.lessonCount} 节课时</small></span><ArrowRight size={15} /></button>) : <p>尚未加入课程，先从 AI 讲堂选择一门。</p>}</section>
      <section><div className="knowledge-evidence__title"><ImageSquare size={19} /><strong>最近的工作流</strong></div>{graph.runs.length ? graph.runs.slice(0, 3).map((run) => <button key={run.id} type="button" onClick={() => onNavigate(`/studio?workflow=${encodeURIComponent(run.workflowId)}&run=${encodeURIComponent(run.id)}`)}><span>{run.workflowName}<small>{run.category || "平台工作流"} · {run.status === "completed" ? "已完成" : "已记录"}</small></span><ArrowRight size={15} /></button>) : <p>还没有平台工作流记录。</p>}</section>
      <section><div className="knowledge-evidence__title"><NotePencil size={19} /><strong>最近的成长足迹</strong></div>{graph.events.length ? graph.events.slice(0, 3).map((event) => <div className="knowledge-evidence__event" key={event.id}><span>{event.title}<small>{event.kind}</small></span><time dateTime={event.at}>{dateLabel(event.at)}</time></div>) : <p>完成课程或留下笔记后，这里会出现记录。</p>}</section></div></details>
  </div>;
}
