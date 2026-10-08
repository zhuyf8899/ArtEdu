import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, BookOpenText, CirclesThree, X } from "@phosphor-icons/react";
import { atlasCourses } from "./curriculumAtlas.js";
import { buildCourseGraph, courseAtlasUrl, courseGraphPath } from "./courseKnowledge.js";
import { graphCenter, graphZoom } from "./graphViewport.js";
import "./CourseKnowledgeGraph.css";

const nodeLabels = { root: "课程", branch: "知识主题", point: "知识点", practice: "建议练习" };

export function CourseKnowledgeGraph({ course, onNavigate, onBack, onPersonal }) {
  const graph = useMemo(() => buildCourseGraph(course), [course]);
  const [selectedId, setSelectedId] = useState(`${course.id}:root`);
  const [showPractice, setShowPractice] = useState(true);
  const [viewMode, setViewMode] = useState("graph");
  const [zoomMode, setZoomMode] = useState("auto");
  const [detailOpen, setDetailOpen] = useState(false);
  const [scale, setScale] = useState(1);
  const viewport = useRef(null);
  const detail = useRef(null);
  const heading = useRef(null);
  const opener = useRef(null);
  const selectedRef = useRef(null);
  const prefix = useId().replace(/:/g, "");
  const detailId = `${prefix}-course-detail`;
  const nodes = graph.nodes.filter((n) => showPractice || n.kind !== "practice");
  const edges = graph.edges.filter((e) => showPractice || e.kind !== "practice");
  const selected = nodes.find((n) => n.id === selectedId) ?? nodes[0];
  selectedRef.current = selected;
  const sourceItems = course.sources.filter((s) => selected.sources.includes(s.id));
  const selectedGroup = selected.kind === "branch" ? selected.key : selected.branchKey;
  const tasks = graph.practices.filter((p) => selected.kind === "root" || selected.kind === "practice" && p.key === selected.key || p.groups.includes(selectedGroup));
  const connections = edges.filter((e) => e.from === selected.id || e.to === selected.id);
  const selectNode = (id) => {
    setSelectedId(id);
    const node = graph.nodes.find((n) => n.id === id);
    if (node && viewport.current?.clientWidth) viewport.current.scrollTo(graphCenter(node, scale, viewport.current));
  };
  const inspectNode = (id, trigger) => {
    setSelectedId(id);
    opener.current = trigger;
    setDetailOpen(true);
  };
  const closeDetail = () => {
    setDetailOpen(false);
    detail.current?.close();
    const target = opener.current?.dataset.knowledgeNode && viewMode === "graph" ? viewport.current?.querySelector(`[data-knowledge-node="${selected.id}"]`) : opener.current;
    if (target?.isConnected) target.focus({ preventScroll: true });
  };
  const locateSelected = () => selectNode(selected.id);
  useEffect(() => {
    if (!detailOpen) return;
    if (!detail.current.open) detail.current.showModal();
    detail.current.scrollTop = 0;
    heading.current?.focus({ preventScroll: true });
  }, [detailOpen, selectedId]);
  useEffect(() => {
    if (viewMode !== "graph") return;
    const frame = requestAnimationFrame(() => {
      if (viewport.current?.clientWidth) viewport.current.scrollTo(graphCenter(selectedRef.current, scale, viewport.current));
    });
    return () => cancelAnimationFrame(frame);
  }, [scale, selectedId, viewMode]);
  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const resize = () => {
      if (!element.clientWidth) return;
      const nextScale = zoomMode === "auto" ? element.clientWidth >= 900 ? Math.max(.85, Math.min(1, element.clientWidth / graph.width)) : 1 : zoomMode === "fit" ? graphZoom(element.clientWidth / graph.width) : scale;
      setScale(nextScale);
      element.scrollTo(graphCenter(selectedRef.current, nextScale, element));
    };
    resize();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    return () => observer.disconnect();
  }, [graph.width, zoomMode, scale, viewMode]);

  return <section className={`course-knowledge domain-${course.domain}`} aria-label={`${course.title}专属知识图谱`} data-course-graph={course.id}>
    <div className="course-knowledge__navigation">
      <button onClick={onBack}><ArrowLeft size={18} />返回十门课程总图</button>
      <div><label>切换课程<select aria-label="切换课程知识图谱" value={course.id} onChange={(e) => onNavigate(courseAtlasUrl(e.target.value))}>{atlasCourses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}</select></label><button onClick={onPersonal}><CirclesThree size={18} />个性化图谱</button></div>
    </div>
    <header className="course-knowledge__heading">
      <div><h3>{course.title}</h3><p>{graph.focus}</p></div>
      <div className="course-knowledge__heading-meta"><span className="course-knowledge__count"><CirclesThree size={20} />{graph.branches.length} 个主题 · {graph.pointCount} 个知识点</span>{selected.kind === "root" && <button onClick={(e) => inspectNode(selected.id, e.currentTarget)}>查看节点详情<ArrowRight size={16} /></button>}</div>
    </header>
    <div className="course-knowledge__map">
      <div className="course-knowledge__controls">
        <label>定位节点<select aria-label="选择课程知识节点" value={selected.id} onChange={(e) => selectNode(e.target.value)}>{nodes.map((n) => <option key={n.id} value={n.id}>{nodeLabels[n.kind]} · {n.title}</option>)}</select></label>
        <div role="group" aria-label="浏览方式"><button aria-pressed={viewMode === "graph"} onClick={() => setViewMode("graph")}>关系图谱</button><button aria-pressed={viewMode === "list"} onClick={() => setViewMode("list")}>知识目录</button></div>
      </div>
      {viewMode === "graph" && <details className="course-knowledge__settings"><summary>画布设置<span>缩放 / 建议练习</span></summary><div className="course-knowledge__browse" role="group" aria-label="画布控制"><button aria-label="缩小图谱" disabled={scale <= .25} onClick={() => { setZoomMode("manual"); setScale((v) => graphZoom(v - .15)); }}>−</button><output aria-label="图谱缩放比例">{Math.round(scale * 100)}%</output><button aria-label="放大图谱" disabled={scale >= 1.5} onClick={() => { setZoomMode("manual"); setScale((v) => graphZoom(v + .15)); }}>＋</button><button onClick={() => setZoomMode("fit")}>适应宽度</button><button onClick={() => { setZoomMode("manual"); setScale(1); selectNode(graph.nodes[0].id); }}>重置视图</button><button onClick={locateSelected}>定位当前节点</button><button aria-pressed={showPractice} onClick={() => { if (showPractice && selected.kind === "practice") setSelectedId(graph.nodes[0].id); setShowPractice((v) => !v); }}>{showPractice ? "隐藏建议练习" : "显示建议练习"}</button></div></details>}
      <p className="course-knowledge__hint">实线表示知识归属，虚线连接建议练习，不是强制先修。{viewMode === "graph" ? "点击圆点查看详情；画布可上下左右滚动，也可切换知识目录。" : "展开主题，直接阅读知识点与资料说明。"}{viewMode === "graph" && scale < .8 && " 当前为全图预览，放大后阅读文字。"}</p>
      {selected.kind !== "root" && <div className="course-knowledge__selection"><span><small>当前节点 · {nodeLabels[selected.kind]}</small><strong>{selected.title}</strong></span><button onClick={(e) => inspectNode(selected.id, e.currentTarget)}>查看节点详情<ArrowRight size={16} /></button></div>}
      <div hidden={viewMode !== "graph"} className="course-knowledge__viewport" ref={viewport} tabIndex={0} aria-label={`${course.title}知识关系画布，可上下左右滚动`}>
        <div className="course-knowledge__surface" style={{ width: graph.width * scale, height: (showPractice ? graph.height : graph.height - 210) * scale }}>
          <div className="course-knowledge__canvas" style={{ width: graph.width, height: graph.height, transform: `scale(${scale})` }}>
            <svg viewBox={`0 0 ${graph.width} ${graph.height}`} aria-hidden="true">
              <defs><marker id={`${prefix}-arrow`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 1 1 L 8 5 L 1 9" fill="none" stroke="currentColor" strokeWidth="1.4" /></marker></defs>
              {edges.map((e) => <path key={`${e.from}-${e.to}`} data-relation={e.kind} className={`${e.kind === "practice" ? "is-practice" : ""} ${e.from === selected.id || e.to === selected.id ? "is-related" : ""}`} d={courseGraphPath(graph, e)} markerEnd={`url(#${prefix}-arrow)`} />)}
            </svg>
            {nodes.map((n) => <button key={n.id} data-knowledge-node={n.id} data-kind={n.kind} className={`course-knowledge__node kind-${n.kind} ${selected.id === n.id ? "is-selected" : ""}`} style={{ left: n.x, top: n.y, width: n.radius * 2, height: n.radius * 2 }} aria-label={`${nodeLabels[n.kind]}：${n.title}`} aria-pressed={selected.id === n.id} aria-haspopup="dialog" aria-controls={detailId} onClick={(e) => inspectNode(n.id, e.currentTarget)}><small>{nodeLabels[n.kind]}</small><strong>{n.title}</strong>{n.kind === "branch" && <span>{n.points.length} 个知识点</span>}</button>)}
          </div>
        </div>
      </div>
      {viewMode === "list" && <div className="course-knowledge__directory" aria-label="课程知识目录">{graph.branches.map((branch, index) => <details key={branch.key} open={index === 0 ? true : undefined}><summary>{branch.title}<span>{branch.points.length} 个知识点</span></summary><p>{branch.summary}</p><div>{nodes.filter((n) => n.id === `${course.id}:branch:${branch.key}` || n.kind === "point" && n.branchKey === branch.key).map((n) => <button key={n.id} onClick={(e) => inspectNode(n.id, e.currentTarget)} aria-haspopup="dialog"><span><small>{nodeLabels[n.kind]}</small><strong>{n.title}</strong></span><ArrowRight size={16} /></button>)}</div></details>)}{showPractice && <details><summary>建议练习<span>{graph.practices.length} 项</span></summary>{nodes.filter((n) => n.kind === "practice").map((n) => <button key={n.id} onClick={(e) => inspectNode(n.id, e.currentTarget)}>{n.title}<ArrowRight size={16} /></button>)}</details>}</div>}
      <footer className="course-knowledge__legend"><span><i />知识主题</span><span><i className="is-point" />具体知识</span><span><i className="is-task" />平台建议练习</span><small>颜色区分节点角色，不表示已学或掌握。</small></footer>
    </div>

    <dialog id={detailId} ref={detail} className="course-knowledge__detail" aria-labelledby={`${detailId}-title`} onCancel={closeDetail} onClose={closeDetail}>
      <button className="course-knowledge__close" aria-label="关闭节点详情" onClick={closeDetail}><X size={20} /></button>
      <header><div><span className="curriculum-atlas__eyebrow">{nodeLabels[selected.kind]} / {course.title}</span><h4 id={`${detailId}-title`} ref={heading} tabIndex={-1}>{selected.title}</h4><p>{selected.summary}</p></div><div className="course-knowledge__detail-actions"><button onClick={() => { if (viewMode === "graph") { selectNode(selected.id); opener.current = viewport.current?.querySelector(`[data-knowledge-node="${selected.id}"]`) ?? opener.current; } closeDetail(); }}><ArrowLeft size={16} />{viewMode === "graph" ? "返回图谱节点" : "返回知识目录"}</button><button onClick={() => onNavigate(`/search?query=${encodeURIComponent(course.searchTerm)}`)}><BookOpenText size={18} />查找平台课程<ArrowRight size={16} /></button></div><small>此处为关键词检索，非正式课程绑定；查看节点不会更新学习进度。</small></header>
      <div className="course-knowledge__detail-grid">
        <section><h5>{selected.kind === "practice" ? "建议成果" : "资料依据"}</h5>{selected.kind === "practice" ? <><p>{selected.outcome}</p><small>此练习由平台编辑建议，不是原教材的作业要求，也不会自动更新学习进度。</small></> : <><ul>{sourceItems.map((s) => <li key={s.id}><strong>{s.title}</strong><small>{s.inspected}</small></li>)}</ul><small>知识点为资料目录与关键页的编辑提炼，非教材全文；主题划分不是原书章节逐条复刻。</small></>}</section>
        <section><h5>知识关联</h5><div className="course-knowledge__related">{connections.map((e) => {
          const n = graph.nodes.find((item) => item.id === (e.from === selected.id ? e.to : e.from));
          return <button key={n.id} onClick={() => selectNode(n.id)}><span><small>{e.kind === "practice" ? "用于建议练习" : e.from === selected.id ? "包含" : "归属于"}</small>{n.title}</span><ArrowRight size={15} /></button>;
        })}</div></section>
        <section><h5>可以怎样练习 <span>平台建议</span></h5>{tasks.map((task) => <div className="course-knowledge__task" key={task.key}><strong>{task.title}</strong><p>{task.instruction}</p><small>留下成果：{task.outcome}</small></div>)}<details><summary>AI 辅助方式</summary><p>{course.aiPractice}</p><small>AI 辅助方式并非原教材内容；需要人工判断与验证。</small></details></section>
      </div>
    </dialog>
  </section>;
}
