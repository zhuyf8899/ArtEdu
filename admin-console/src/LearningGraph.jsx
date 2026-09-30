import { useMemo } from "react";
import { ArrowRight, BookOpenText, Clock, ImageSquare, NotePencil, Student } from "@phosphor-icons/react";
import { buildLearningFramework, buildLearningGraph } from "./learningGraphModel.js";

const COLUMNS = [
  ["我的学习地图", BookOpenText, "课程路径"],
  ["我的能力画像", Student, "课时与练习"],
  ["我的工具轨迹", ImageSquare, "平台工作流"],
  ["我的成长记录", Clock, "笔记与作品"],
];
const STATUS = { skilled: "熟练", good: "良好", basic: "一般", none: "未学习" };
const dateLabel = (value) => new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric" }).format(new Date(value));

export function LearningGraph({ data, displayName, onNavigate, onView }) {
  const graph = useMemo(() => buildLearningGraph(data), [data]);
  const framework = useMemo(() => buildLearningFramework(graph), [graph]);
  const goTo = (action) => action?.startsWith("/") ? onNavigate(action) : action && onView(action);
  const next = framework.nextCell;

  return <div className="knowledge-page knowledge-page--framework">
    <div className="knowledge-intro">
      <div><span className="knowledge-kicker">YOUR LEARNING ATLAS / 个人学习图谱</span><h2>{displayName}的艺术学习，正在生长。</h2><p>一张框架图，把课程、能力、工具和成长放在同一条学习路径上。</p></div>
      <div className="knowledge-intro__mark" aria-hidden="true"><span>知</span><i /><span>行</span></div>
    </div>
    <div className="knowledge-stats" aria-label="学习记录概览">
      <div><span>加入课程</span><strong>{graph.summary.courseCount}<small> 门</small></strong></div>
      <div><span>完成课时</span><strong>{graph.summary.completedLessons}<small> / {graph.summary.totalLessons} 节</small></strong></div>
      <div><span>最近工作流</span><strong>{graph.summary.workflowCount}<small> 条记录</small></strong></div>
      <div><span>创作作品</span><strong>{graph.summary.workCount}<small> 件</small></strong></div>
    </div>

    <section className="knowledge-framework" aria-labelledby="knowledge-framework-title">
      <header className="knowledge-framework__heading"><div><span className="knowledge-kicker">01—04 / LEARNING JOURNEY</span><h3 id="knowledge-framework-title">我的 AI 艺术学习框架</h3><p>纵向看阶段，横向看四个方面；点击任一格继续对应的学习行动。</p></div><div className="knowledge-legend" aria-label="阶段进度颜色说明">{Object.entries(STATUS).map(([key, label]) => <span key={key}><i className={`knowledge-legend__dot is-${key}`} />{label}</span>)}</div></header>
      <div className="knowledge-framework__table">
        <div className="knowledge-framework__columns"><div className="knowledge-framework__corner">学习阶段 / 四个方面</div>{COLUMNS.map(([label, Icon, detail]) => <div key={label}><Icon size={21} weight="duotone" /><strong>{label}</strong><small>{detail}</small></div>)}</div>
        {framework.stages.map((stage) => {
          const active = stage.id === framework.currentStage.id && !framework.allComplete;
          const stageProgress = Math.round(stage.cells.reduce((sum, cell) => sum + cell.ratio, 0) / stage.cells.length * 100);
          return <div className={`knowledge-framework__row ${active ? "is-current" : ""}`} key={stage.id}>
            <div className="knowledge-framework__stage"><span>{stage.number} / STAGE</span><strong>{stage.title}</strong><small>{stage.subtitle}</small><em>{active ? "当前阶段" : `阶段记录 ${stageProgress}%`}</em></div>
            {stage.cells.map((cell, column) => <button type="button" key={column} data-domain={COLUMNS[column][0]} className={`knowledge-framework__cell is-${cell.state}`} onClick={() => goTo(cell.action)} aria-label={`${stage.title}，${COLUMNS[column][0]}：${cell.title}，${STATUS[cell.state]}，${cell.display ?? `${cell.value}/${cell.target} ${cell.unit}`}。${cell.nextStep}`}>
              <span className="knowledge-framework__cell-top"><i />{STATUS[cell.state]}</span>
              <strong>{cell.title}</strong><small>{cell.display ?? `${cell.value} / ${cell.target} ${cell.unit}`}</small>
              <span className="knowledge-framework__cell-bottom"><span>{cell.nextStep}</span><ArrowRight size={15} /></span>
            </button>)}
          </div>;
        })}
      </div>
      <p className="knowledge-framework__disclaimer">颜色依据本阶段可观察的课程、练习、笔记、作品和近期工作流记录计算；“熟练”仅表示达到该格的展示目标，不是正式能力认证。外部 AI 工具的实际使用尚未接入。</p>
    </section>

    <section className="knowledge-guidance" aria-label="下一阶段建议">
      <div className="knowledge-guidance__lead"><span className="knowledge-kicker">NEXT STEP / 下一步</span><h3>{framework.allComplete ? "继续拓展自己的艺术表达" : `当前在「${framework.currentStage.title}」阶段`}</h3><p>{next ? `下一项建议：${next.nextStep}。这条建议来自当前框架中尚未完成的学习记录。` : "当前展示目标已达到。尝试新的课程、题材和工作流，持续拓展自己的方法。"}</p><button type="button" onClick={() => goTo(next?.action ?? "/learning")}>{next ? "开始下一步" : "探索新课程"}<ArrowRight size={16} /></button></div>
      <div className="knowledge-guidance__reason"><strong>为什么推荐这一步？</strong><p>{next ? `「${next.title}」目前记录为 ${next.display ?? `${next.value} / ${next.target} ${next.unit}`}，补上这一步可以推进当前阶段。` : "四个方面都已有阶段记录，接下来可以选择自己感兴趣的方向继续深挖。"}</p><span>推荐基于学习记录，不替代教师评价。</span></div>
    </section>

    <div className="knowledge-evidence"><section><div className="knowledge-evidence__title"><BookOpenText size={19} /><strong>正在学习的课程</strong></div>{graph.courses.length ? graph.courses.slice(0, 3).map((course) => <button key={course.id} type="button" onClick={() => onNavigate(`/learning?course=${encodeURIComponent(course.id)}`)}><span>{course.title}<small>{course.completedLessons} / {course.lessonCount} 节课时</small></span><ArrowRight size={15} /></button>) : <p>尚未加入课程，先从 AI 讲堂选择一门。</p>}</section>
      <section><div className="knowledge-evidence__title"><ImageSquare size={19} /><strong>最近的工作流</strong></div>{graph.runs.length ? graph.runs.slice(0, 3).map((run) => <button key={run.id} type="button" onClick={() => onNavigate(`/studio?workflow=${encodeURIComponent(run.workflowId)}&run=${encodeURIComponent(run.id)}`)}><span>{run.workflowName}<small>{run.category || "平台工作流"} · {run.status === "completed" ? "已完成" : "已记录"}</small></span><ArrowRight size={15} /></button>) : <p>还没有平台工作流记录。</p>}</section>
      <section><div className="knowledge-evidence__title"><NotePencil size={19} /><strong>最近的成长足迹</strong></div>{graph.events.length ? graph.events.slice(0, 3).map((event) => <div className="knowledge-evidence__event" key={event.id}><span>{event.title}<small>{event.kind}</small></span><time dateTime={event.at}>{dateLabel(event.at)}</time></div>) : <p>完成课程或留下笔记后，这里会出现记录。</p>}</section></div>
  </div>;
}
