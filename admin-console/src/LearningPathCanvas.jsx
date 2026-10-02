import { useId, useState } from "react";
import { ArrowRight, CaretRight, Lightbulb, X } from "@phosphor-icons/react";
import { learningBranches } from "./learningPathModel.js";

export function LearningPathCanvas({ graph, framework, contents, paths, selectedStage, selectedColumn, onSelect, onGoTo, detailId, columns }) {
  const [showAll, setShowAll] = useState(false);
  const [focusId, setFocusId] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  const focusIndex = Math.max(0, framework.stages.findIndex((stage) => stage.id === (focusId ?? framework.currentStage.id)));
  const start = Math.min(focusIndex, framework.stages.length - 2);
  const visibleStages = showAll ? framework.stages : framework.stages.slice(start, start + 2);
  const content = contents[selectedStage.id][Math.min(selectedColumn, 3)];
  const recommendation = paths[selectedStage.id].recommendation;
  const branches = learningBranches(graph, content, recommendation, selectedColumn);
  const select = (stageId, column) => { onSelect({ stageId, column }); setExpanded(true); };
  return <>
    <div className="knowledge-path__toolbar">
      <div className="knowledge-path__stages" aria-label="选择学习阶段">{framework.stages.map((stage) => <button type="button" key={stage.id} aria-pressed={!showAll && visibleStages.some((item) => item.id === stage.id)} onClick={() => { setFocusId(stage.id); setShowAll(false); onSelect({ stageId: stage.id, column: 0 }); setExpanded(false); }}>{stage.number} {stage.title}</button>)}</div>
      <button type="button" className="knowledge-path__all" aria-pressed={showAll} onClick={() => { setShowAll((value) => !value); setFocusId(null); onSelect({ stageId: framework.currentStage.id, column: 0 }); setExpanded(false); }}>{showAll ? "聚焦当前与下一阶段" : "查看全部阶段"}</button>
    </div>
    <div className="knowledge-path__line-legend"><span><i />已有记录或配置关联</span><span><i className="is-suggested" />建议路径</span><small>箭头表示路径方向，不代表正式能力认证</small></div>
    <p className="knowledge-orbits__scroll-hint" id={`${id}-hint`}>{showAll ? "全部四阶段" : "当前聚焦两个阶段"} · 点击圆点展开关联，小屏可左右滑动</p>
    <div className="knowledge-orbits__viewport" tabIndex={0} role="region" aria-label="阶段学习关系图谱，可横向滚动" aria-describedby={`${id}-hint`}>
      <div className="knowledge-orbits__canvas knowledge-path__canvas" style={{ "--path-stage-count": visibleStages.length }}>
        {visibleStages.map((stage, stageIndex) => {
          const active = stage.id === framework.currentStage.id && !framework.allComplete;
          const progress = Math.round(stage.cells.reduce((sum, cell) => sum + cell.ratio, 0) / 4 * 100);
          const arrowId = `${id}-${stage.id}-arrow`;
          const suggestion = paths[stage.id].recommendation;
          return <section className={`knowledge-orbits__stage knowledge-path__stage ${active ? "is-current" : ""}`} key={stage.id} aria-label={`第${stage.number}阶段：${stage.title}`}>
            <header className="knowledge-orbits__stage-heading"><span>阶段 {stage.number}</span><h4>{stage.title}</h4><small>{active ? "当前阶段" : stage.id === framework.stages[focusIndex + 1]?.id ? "下一阶段" : "阶段目标"} · {progress}%</small></header>
            <svg className="knowledge-path__edges" width="400" height="552" viewBox="0 0 400 552" aria-hidden="true" focusable="false">
              <defs><marker id={arrowId} markerWidth="7" markerHeight="7" refX="5.5" refY="3.5" orient="auto"><path d="M1 1 L5.5 3.5 L1 6" fill="none" stroke="currentColor" strokeWidth="1.2" /></marker></defs>
              {paths[stage.id].edges.map((edge) => <g key={edge.id} className={edge.existing ? "is-existing" : "is-suggested"} data-edge={edge.id}>
                <path d={edge.path} markerEnd={`url(#${arrowId})`} />
                <rect x={edge.x - 28} y={edge.y - 10} width="56" height="17" rx="6" /><text x={edge.x} y={edge.y + 2} textAnchor="middle">{edge.label}</text>
              </g>)}
            </svg>
            {stageIndex < visibleStages.length - 1 && <div className="knowledge-path__stage-link" data-edge="suggestion-to-stage" aria-hidden="true"><span>后续阶段</span><CaretRight size={13} weight="bold" /></div>}
            {stage.cells.map((cell, column) => {
              const node = contents[stage.id][column];
              const pressed = selectedStage.id === stage.id && selectedColumn === column;
              return <button type="button" key={column} data-node-kind="record" data-domain={columns[column][0]} className={`knowledge-orbits__node knowledge-path__node knowledge-path__node--${column} is-${cell.state} ${pressed ? "is-selected" : ""}`} onClick={() => select(stage.id, column)} aria-pressed={pressed} aria-expanded={pressed && expanded} aria-controls={`${id}-branches ${detailId}`} title={`${node.recordLabel}：${node.headline}\n${node.topic}`} aria-label={`${stage.title}，${columns[column][0]}：${node.recordLabel}，${node.headline}。点击展开关联分支`}>
                <span className="knowledge-orbits__node-record">{node.recordLabel}</span><strong>{node.headline}</strong><small>{node.topic}</small>
              </button>;
            })}
            <button type="button" data-node-kind="recommendation" className={`knowledge-orbits__node knowledge-path__node knowledge-path__suggestion ${selectedStage.id === stage.id && selectedColumn === 4 ? "is-selected" : ""}`} onClick={() => select(stage.id, 4)} aria-pressed={selectedStage.id === stage.id && selectedColumn === 4} aria-expanded={selectedStage.id === stage.id && selectedColumn === 4 && expanded} aria-controls={`${id}-branches ${detailId}`} aria-label={`${stage.title}的学习建议：${suggestion.title}。点击查看依据并开始学习`} title={suggestion.title}>
              <span className="knowledge-orbits__node-record"><Lightbulb size={14} />{suggestion.label}</span><strong>{suggestion.title}</strong><small>查看依据 · 开始学习</small>
            </button>
          </section>;
        })}
      </div>
    </div>
    <section className="knowledge-path__expanded" id={`${id}-branches`} hidden={!expanded} aria-label="选中圆点的关联分支">
      <header><div><span>关联分支 · {selectedStage.title}</span><strong>{selectedColumn === 4 ? recommendation.title : content.headline}</strong></div><button type="button" onClick={() => setExpanded(false)}><X size={15} />收起分支</button></header>
      {branches.length ? <div className="knowledge-path__branch-list">{branches.map((branch, index) => <div key={`${branch.title}-${index}`} className={`knowledge-path__branch ${branch.existing ? "is-existing" : "is-suggested"}`}><span className="knowledge-path__branch-line">{branch.relation}<ArrowRight size={13} /></span><button type="button" className={`knowledge-orbits__node knowledge-path__leaf is-${branch.state}`} onClick={() => onGoTo(branch.action)} title={branch.title} aria-label={`${branch.relation}：${branch.title}，点击打开`}><strong>{branch.title}</strong><small>打开内容<ArrowRight size={12} /></small></button></div>)}</div> : <p className="knowledge-path__empty">暂无已配置的关联内容，不推测知识点关系。可在下方查看下一步建议。</p>}
    </section>
  </>;
}
