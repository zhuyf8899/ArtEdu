import { useEffect, useMemo, useState } from "react";
import { ArrowClockwise, ArrowLeft, ArrowRight, BookOpenText, CheckCircle, Clock, Funnel, PlayCircle, SpinnerGap, Wrench } from "@phosphor-icons/react";
import { enrollCourse, getCourse, getCourses, updateLessonProgress } from "./services/adminApi.js";

const COURSE_PROFILES = {
  "course-ai-design-foundation": { method: "UI 创作", author: "周可老师", tools: ["GPT-4o", "Figma"] },
  "course-traditional-pattern": { method: "图案生成", author: "林知夏老师", tools: ["FLUX.1", "Midjourney"] },
  "course-vibe-gallery": { method: "Vibe Coding", author: "陈明远老师", tools: ["Claude 4", "VS Code"] },
};

const METHOD_FILTERS = ["全部", "UI 创作", "图案生成", "Vibe Coding"];

function decorateCourse(course) {
  const profile = COURSE_PROFILES[course.id] ?? {};
  const title = course.title ?? "";
  const inferredMethod = title.toLowerCase().includes("coding") || title.includes("网页")
    ? "Vibe Coding"
    : title.includes("纹样") || title.includes("图案")
      ? "图案生成"
      : "UI 创作";
  return {
    ...course,
    method: course.method ?? profile.method ?? inferredMethod,
    author: course.author ?? course.creatorName ?? profile.author ?? "ArtEdu 教学团队",
    tools: course.tools?.length ? course.tools : profile.tools ?? ["GPT-4o"],
  };
}

export function LearningLibrary({ onNotice }) {
  const [courses, setCourses] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState("");
  const [methodFilter, setMethodFilter] = useState("全部");
  const [authorFilter, setAuthorFilter] = useState("全部作者");
  const [toolFilter, setToolFilter] = useState("全部工具");

  const loadCatalog = async () => {
    setCatalogLoading(true);
    setCatalogError("");
    try { const payload = await getCourses(); setCourses(payload.items ?? []); }
    catch (error) { setCatalogError(error.message); onNotice(error.message); }
    finally { setCatalogLoading(false); }
  };

  useEffect(() => { void loadCatalog(); }, []);

  const openCourse = async (courseId) => {
    setLoading(true);
    try { setSelected(decorateCourse(await getCourse(courseId))); }
    catch (error) { onNotice(error.message); }
    finally { setLoading(false); }
  };

  const enroll = async () => {
    setLoading(true);
    try { setSelected(decorateCourse(await enrollCourse(selected.id))); onNotice("课程已加入“我的学习”"); }
    catch (error) { onNotice(error.message); }
    finally { setLoading(false); }
  };

  const completeLesson = async (lessonId) => {
    setLoading(true);
    try { setSelected(decorateCourse(await updateLessonProgress(selected.id, lessonId, 100))); onNotice("课时已完成，学习进度已保存"); }
    catch (error) { onNotice(error.message); }
    finally { setLoading(false); }
  };

  const decoratedCourses = useMemo(() => courses.map(decorateCourse), [courses]);
  const authors = useMemo(() => [...new Set(decoratedCourses.map((course) => course.author))], [decoratedCourses]);
  const tools = useMemo(() => [...new Set(decoratedCourses.flatMap((course) => course.tools))], [decoratedCourses]);
  const filteredCourses = useMemo(() => decoratedCourses.filter((course) => {
    const matchesMethod = methodFilter === "全部" || course.method === methodFilter;
    const matchesAuthor = authorFilter === "全部作者" || course.author === authorFilter;
    const matchesTool = toolFilter === "全部工具" || course.tools.includes(toolFilter);
    return matchesMethod && matchesAuthor && matchesTool;
  }), [decoratedCourses, methodFilter, authorFilter, toolFilter]);

  const resetFilters = () => {
    setMethodFilter("全部");
    setAuthorFilter("全部作者");
    setToolFilter("全部工具");
  };

  if (selected) return <section className="learning-detail">
    <button className="learning-back" onClick={() => setSelected(null)}><ArrowLeft size={16} weight="bold" /> 返回课程库</button>
    <div className="learning-detail__hero"><div><span>{selected.method} · {selected.category} · {difficultyName(selected.difficulty)}</span><h2>{selected.title}</h2><p>{selected.summary}</p><div><Clock size={16} /> {selected.estimatedMinutes} 分钟 · {selected.lessonCount} 个课时 · 作者 {selected.author}</div><div className="learning-detail__tools"><Wrench size={15} /> {selected.tools.join(" / ")}</div></div><aside><strong>{selected.progressPercent}%</strong><span>学习进度</span><i><b style={{ width: `${selected.progressPercent}%` }} /></i>{selected.enrollmentStatus ? <em>已加入学习</em> : <button disabled={loading} onClick={enroll}><PlayCircle size={18} weight="fill" /> 加入课程</button>}</aside></div>
    <div className="lesson-list">{selected.lessons.map((lesson, index) => <article key={lesson.id}><span>{String(index + 1).padStart(2, "0")}</span><div><small>{lesson.lessonType === "workflow" ? "AI 工作流实践" : "课程课时"}</small><strong>{lesson.title}</strong><p>{lesson.summary}</p></div><div><em>{lesson.estimatedMinutes} 分钟</em>{lesson.progressPercent >= 100 ? <b><CheckCircle size={17} weight="fill" /> 已完成</b> : <button disabled={loading} onClick={() => completeLesson(lesson.id)}>标记完成 <ArrowRight size={15} /></button>}</div></article>)}</div>
    {selected.resources?.length > 0 && <section className="course-materials"><p>// COURSE MATERIALS</p><h3>课程资料</h3>{selected.resources.map((resource) => <a key={resource.id} href={resource.downloadUrl ?? resource.externalUrl} target={resource.externalUrl ? "_blank" : undefined} rel={resource.externalUrl ? "noreferrer" : undefined}><BookOpenText size={18} weight="bold" /><span><strong>{resource.title}</strong><small>{({ pdf: "PDF", word: "WORD", ppt: "PPT" }[resource.resourceType] ?? resource.resourceType?.toUpperCase() ?? "FILE")}</small></span><ArrowRight size={16} weight="bold" /></a>)}</section>}
  </section>;

  if (catalogLoading) return <section className="resource-load-state" aria-busy="true"><SpinnerGap size={32} className="spin" /><strong>正在加载教学资源</strong><p>正在同步课程、作者和工具标签。</p></section>;
  if (catalogError) return <section className="resource-load-state resource-load-state--error"><ArrowClockwise size={31} weight="bold" /><strong>教学资源暂时无法加载</strong><p>{catalogError}</p><button onClick={loadCatalog}>重新加载</button></section>;

  return <>
    <section className="resource-filters" aria-label="课程资源筛选">
      <div className="resource-filters__title"><Funnel size={19} weight="bold" /><div><strong>按标签筛选课程</strong><span>{filteredCourses.length} / {decoratedCourses.length} 项资源</span></div></div>
      <FilterRow label="使用方法" items={METHOD_FILTERS} value={methodFilter} onChange={setMethodFilter} />
      <FilterRow label="作者" items={["全部作者", ...authors]} value={authorFilter} onChange={setAuthorFilter} />
      <FilterRow label="使用工具" items={["全部工具", ...tools]} value={toolFilter} onChange={setToolFilter} />
    </section>
    {filteredCourses.length ? <section className="course-grid">{filteredCourses.map((course, index) => <article className="course-card" key={course.id}>
      <div className={`course-cover course-cover--${index % 3}`}><BookOpenText size={32} weight="thin" /><span>{course.method}</span></div>
      <div className="course-card__content">
        <div className="course-card__tags"><b>{course.method}</b><span>{course.category}</span></div>
        <small>{course.lessonCount ?? 0} 个课时 · {difficultyName(course.difficulty)}</small>
        <h3>{course.title}</h3><p>{course.summary}</p>
        <div className="course-card__meta"><span>作者</span><strong>{course.author}</strong><span>工具</span><strong>{course.tools.join(" · ")}</strong></div>
        <div className="course-card__footer"><div><i><b style={{ width: `${course.progressPercent ?? 0}%` }} /></i><span>{course.progressPercent ?? 0}%</span></div><button disabled={loading} onClick={() => openCourse(course.id)} aria-label={`打开${course.title}`}><ArrowRight size={18} weight="bold" /></button></div>
      </div>
    </article>)}</section> : <section className="resource-empty"><strong>没有符合当前标签的课程</strong><p>可以减少一个筛选条件，或返回查看全部资源。</p><button onClick={resetFilters}>清除筛选</button></section>}
  </>;
}

function FilterRow({ label, items, value, onChange }) {
  return <div className="filter-row"><span>{label}</span><div>{items.map((item) => <button key={item} className={value === item ? "is-active" : ""} onClick={() => onChange(item)}>{item}</button>)}</div></div>;
}

function difficultyName(value) {
  return { beginner: "入门", intermediate: "进阶", advanced: "高级" }[value] ?? "入门";
}
