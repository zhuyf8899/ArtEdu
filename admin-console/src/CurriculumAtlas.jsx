import { useEffect, useId, useRef, useState } from "react";
import { ArrowRight, ArrowsClockwise, BookOpenText, CirclesThree, MagnifyingGlass, Student } from "@phosphor-icons/react";
import { atlasCourses, atlasDomains, atlasRelations, atlasNeighbors, atlasEdgePath, findAtlasCourses } from "./curriculumAtlas.js";
import { courseAtlasUrl, courseKnowledgeCount } from "./courseKnowledge.js";
import { CourseKnowledgeGraph } from "./CourseKnowledgeGraph.jsx";
import { graphCenter } from "./graphViewport.js";
import "./CurriculumAtlas.css";

export function CurriculumAtlas({ onPersonal, onNavigate, courseId = "" }) {
  const [selectedId, setSelectedId] = useState(atlasCourses[0].id);
  const [query, setQuery] = useState("");
  const [domain, setDomain] = useState("all");
  const [connections, setConnections] = useState("route");
  const [scale, setScale] = useState(1);
  const viewport = useRef(null);
  const selectedRef = useRef(null);
  const prefix = useId().replace(/:/g, "");
  const courseView = atlasCourses.find((course) => course.id === courseId);
  useEffect(() => {
    const element = viewport.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const resize = () => {
      const nextScale = element.clientWidth >= 900 ? Math.min(1, element.clientWidth / 1110) : 1;
      setScale(nextScale);
      if (selectedRef.current) element.scrollTo(graphCenter(selectedRef.current, nextScale, element));
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    return () => observer.disconnect();
  }, [courseId]);
  useEffect(() => { if (courseView) setSelectedId(courseView.id); }, [courseView]);
  const matches = findAtlasCourses(query, domain);
  const matchIds = new Set(matches.map((course) => course.id));
  const selected = matches.find((course) => course.id === selectedId) ?? matches[0] ?? null;
  selectedRef.current = selected;
  useEffect(() => {
    if (courseView || !selected) return;
    const frame = requestAnimationFrame(() => {
      if (viewport.current) viewport.current.scrollTo(graphCenter(selected, scale, viewport.current));
    });
    return () => cancelAnimationFrame(frame);
  }, [courseId, selected?.id, scale]);
  const neighbors = selected ? atlasNeighbors(selected.id) : [];
  const highlighted = new Set([selected?.id, ...neighbors.map((n) => n.course.id)]);
  const selectCourse = (id, reveal = true) => {
    setSelectedId(id);
    if (reveal) {
      const node = viewport.current?.querySelector(`[data-atlas-course="${id}"]`);
      if (node) viewport.current.scrollTo({ left: node.offsetLeft * scale - viewport.current.clientWidth / 2, behavior: "auto" });
    }
  };
  const openCourse = (id) => { selectCourse(id, false); onNavigate(courseAtlasUrl(id)); };
  const followConnection = (id) => { setDomain("all"); setQuery(""); openCourse(id); };
  const reset = () => { setQuery(""); setDomain("all"); setConnections("route"); selectCourse(atlasCourses[0].id); };

  return <section className={`curriculum-atlas ${courseView ? "curriculum-atlas--course" : ""}`} aria-label="通用课程知识图谱">
    {!courseView && <header className="curriculum-atlas__heading">
      <div><span className="curriculum-atlas__eyebrow">CURRICULUM ATLAS / 通用课程路线</span><h2>从知识出发，找到创作方向。</h2><p>先看十门课程的关联，再进入每门课程独立的知识图谱。</p></div>
      <button className="curriculum-atlas__personal" onClick={onPersonal}><Student size={20} /><span>个性化图谱<small>查看我的进度与成长</small></span><ArrowRight size={18} /></button>
    </header>}

    {courseView ? <CourseKnowledgeGraph key={courseView.id} course={courseView} onNavigate={onNavigate} onPersonal={onPersonal} onBack={() => onNavigate("/my-learning")} /> : <>
    {courseId && <p className="curriculum-atlas__empty" role="status">未找到这门课程的图谱，已显示十门课程总图。<button onClick={() => onNavigate("/my-learning")}>返回总图</button></p>}
    <div className="curriculum-atlas__toolbar">
      <div className="curriculum-atlas__filters" role="group" aria-label="课程方向">
        {[{ id: "all", label: "全部方向" }, ...atlasDomains].map((item) => <button key={item.id} aria-pressed={domain === item.id} onClick={() => setDomain(item.id)}>{item.label}</button>)}
      </div>
      <label className="curriculum-atlas__search"><MagnifyingGlass size={18} /><input aria-label="搜索图谱课程或知识点" placeholder="搜索课程、知识点" value={query} maxLength={100} onChange={(e) => setQuery(e.target.value)} /></label>
    </div>

    <div className="curriculum-atlas__graph">
      <div className="curriculum-atlas__controls">
        <span><CirclesThree size={18} />{matches.length} / 10 门课程 <i>·</i> {courseKnowledgeCount} 个分图知识点</span>
        <div><label>连线<select aria-label="图谱连线显示" value={connections} onChange={(e) => setConnections(e.target.value)}><option value="route">建议学习路线</option><option value="all">路线与知识迁移</option></select></label><button aria-label="重置图谱筛选" onClick={reset}><ArrowsClockwise size={17} />重置</button></div>
      </div>
      <p className="curriculum-atlas__hint">点击圆形课程进入专属分图；小屏可左右滑动，也可直接选择课程。颜色区分知识方向，不表示学习进度。</p>
      <label className="curriculum-atlas__picker">选择课程<select aria-label="选择图谱课程" value={selected?.id ?? ""} onChange={(e) => openCourse(e.target.value)}>{matches.length ? matches.map((course) => <option key={course.id} value={course.id}>{course.title}</option>) : <option value="">没有匹配课程</option>}</select></label>
      {!matches.length && <div className="curriculum-atlas__empty" role="status">未找到匹配课程或知识点。<button onClick={reset}>清除筛选</button></div>}
      <div className="curriculum-atlas__viewport" ref={viewport} tabIndex={0} aria-label="十门课程关系图，可左右滚动">
        <div className="curriculum-atlas__surface" style={{ "--atlas-scale": scale }}><div className="curriculum-atlas__canvas">
          <div className="curriculum-atlas__phase phase-foundation"><span>01</span><strong>理解设计</strong><small>建立问题意识与意义理解</small></div>
          <div className="curriculum-atlas__phase phase-method"><span>02</span><strong>选择方法</strong><small>从研究走向体验与方案</small></div>
          <div className="curriculum-atlas__phase phase-practice"><span>03</span><strong>进入创作</strong><small>视觉表达 / 交互实践 / 材料造型</small></div>
          <svg className="curriculum-atlas__edges" viewBox="0 0 1110 700" preserveAspectRatio="none" aria-hidden="true">
            <defs><marker id={`${prefix}-arrow`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 1 1 L 8 5 L 1 9" fill="none" stroke="currentColor" strokeWidth="1.4" /></marker></defs>
            {atlasRelations.filter((edge) => connections === "all" || edge.kind === "route").map((edge) => <path key={`${edge.from}-${edge.to}`} className={`${edge.kind === "transfer" ? "is-transfer" : ""} ${edge.from === selected?.id || edge.to === selected?.id ? "is-related" : ""}`} d={atlasEdgePath(edge)} markerEnd={`url(#${prefix}-arrow)`} />)}
          </svg>
          {atlasCourses.map((course, index) => <button key={course.id} data-atlas-course={course.id} className={`curriculum-atlas__node domain-${course.domain} ${course.id === selected?.id ? "is-selected" : ""} ${!matchIds.has(course.id) ? "is-filtered" : ""} ${highlighted.has(course.id) ? "is-connected" : ""}`} style={{ left: `${course.x / 1110 * 100}%`, top: `${course.y}px` }} disabled={!matchIds.has(course.id)} aria-pressed={selected?.id === course.id} aria-label={`${course.title}，进入课程知识图谱`} onClick={() => openCourse(course.id)}><span>{String(index + 1).padStart(2, "0")} / {atlasDomains.find((d) => d.id === course.domain).label}</span><strong>{course.lines.map((line) => <span key={line}>{line}</span>)}</strong><small>{course.cue}</small></button>)}
        </div></div>
      </div>
      <footer className="curriculum-atlas__legend"><div>{atlasDomains.map((d) => <span key={d.id} className={`domain-${d.id}`}><i />{d.label}</span>)}</div><p><span className="line-key" />建议路线 <span className="line-key is-dashed" />知识迁移（切换连线可见）</p></footer>
    </div>

    {selected && <section id="curriculum-atlas-detail" className={`curriculum-atlas__detail domain-${selected.domain}`} aria-label="课程知识与学习建议">
      <header><div><span className="curriculum-atlas__eyebrow">COURSE / {atlasDomains.find((d) => d.id === selected.domain).label}</span><h3>{selected.title}</h3><p>{selected.summary}</p></div><div className="curriculum-atlas__actions"><button onClick={() => openCourse(selected.id)}>查看课程知识图谱<ArrowRight size={16} /></button><button onClick={() => onNavigate(`/search?query=${encodeURIComponent(selected.searchTerm)}`)}><BookOpenText size={18} />查找平台课程<ArrowRight size={16} /></button></div></header>
      <div className="curriculum-atlas__detail-grid">
        <section><h4>将学习什么</h4><ol>{selected.knowledge.map((point) => <li key={point}>{point}</li>)}</ol><details><summary>课程资料依据 · {selected.sources.length} 份</summary><ul>{selected.sources.map((s) => <li key={s.id}><strong>{s.title}</strong><small>{s.inspected}</small></li>)}</ul></details></section>
        <section><h4>尝试一项练习 <span>建议</span></h4><p>{selected.exercise}</p><div className="curriculum-atlas__output"><span>可以留下的成果</span><p>{selected.outcome}</p></div><details><summary>如何用 AI 辅助</summary><p>{selected.aiPractice}</p><small>AI 辅助方式为平台编辑建议，并非原教材内容。</small></details></section>
        <section><h4>接下来可以探索</h4><p className="curriculum-atlas__relation-note">连线为编辑建议，可自由选择，不是必修顺序。</p><div className="curriculum-atlas__relations">{neighbors.filter((n) => n.direction === "next").map((n) => <button key={n.course.id} onClick={() => followConnection(n.course.id)}><span><small>{n.kind === "transfer" ? "知识迁移" : "建议路线"}</small><strong>{n.course.title}</strong><em>{n.reason}</em></span><ArrowRight size={16} /></button>)}</div>{!neighbors.some((n) => n.direction === "next") && <p>可整理本方向的实践成果，或回到关联课程补充基础。</p>}{neighbors.some((n) => n.direction === "before") && <details><summary>回看关联基础</summary>{neighbors.filter((n) => n.direction === "before").map((n) => <button className="curriculum-atlas__previous" key={n.course.id} onClick={() => followConnection(n.course.id)}>{n.course.title}<ArrowRight size={15} /></button>)}</details>}</section>
      </div>
    </section>}
    </>}
    <p className="curriculum-atlas__disclaimer">依据《AI课程设计》十个课程方向的资料目录与关键内容提炼，非教材全文或正式授课大纲。通用图谱无需配置任务点；个人进度请进入“个性化图谱”。查找平台课程仅检索已发布内容，不代表这十门课程均已上线。</p>
  </section>;
}
