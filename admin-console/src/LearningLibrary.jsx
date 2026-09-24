import { useEffect, useMemo, useState } from "react";
import { ArrowClockwise, ArrowLeft, ArrowRight, BookOpenText, CheckCircle, Clock, Funnel, PlayCircle, SpinnerGap, Wrench } from "@phosphor-icons/react";
import { enrollCourse, getCourse, getCourses, getMyWorks, submitLessonWork, updateLessonProgress } from "./services/adminApi.js";

const COURSE_PROFILES = {
  "course-ai-design-foundation": { method: "UI 创作", author: "周可老师", tools: ["GPT-4o", "Figma"] },
  "course-traditional-pattern": { method: "图案生成", author: "林知夏老师", tools: ["FLUX.1", "Midjourney"] },
  "course-vibe-gallery": { method: "Vibe Coding", author: "陈明远老师", tools: ["Claude 4", "VS Code"] },
};

const COURSE_IMAGES = {
  "course-ai-design-foundation": "/assets/learning/ai-design-foundations.jpg",
  "course-traditional-pattern": "/assets/learning/traditional-patterns.jpg",
  "course-vibe-gallery": "/assets/learning/vibe-coding.jpg",
};

const FALLBACK_IMAGES = Object.values(COURSE_IMAGES);

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
  const [myWorks, setMyWorks] = useState([]);
  const [completionChecks, setCompletionChecks] = useState({});
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
    try {
      const [course, works] = await Promise.all([getCourse(courseId), getMyWorks()]);
      setSelected(decorateCourse(course)); setMyWorks(works.items ?? []); setCompletionChecks({});
    }
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
    try { setSelected(decorateCourse(await updateLessonProgress(selected.id, lessonId, 100, { completionConfirmed: true }))); onNotice("课时已完成，学习时长、课程进度与今日任务已同步"); }
    catch (error) { onNotice(error.message); }
    finally { setLoading(false); }
  };

  const saveLessonWork = async (lessonId, workId) => {
    if (!workId) return;
    setLoading(true);
    try {
      setSelected(decorateCourse(await submitLessonWork(selected.id, lessonId, { workId })));
      onNotice("作品已关联到课时，可以继续确认完成标准");
    } catch (error) { onNotice(error.message); }
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
    <div className="lesson-list">{selected.lessons.map((lesson, index) => <article className="lesson-card" key={lesson.id}>
      <div className="lesson-card__heading"><span>{String(index + 1).padStart(2, "0")}</span><div><small>{lesson.lessonType === "workflow" ? "AI 工作流实践" : lesson.lessonType === "practice" ? "动手练习" : lesson.lessonType === "assignment" ? "课时作业" : "课程课时"} · {lesson.estimatedMinutes} 分钟</small><strong>{lesson.title}</strong><p>{lesson.summary}</p></div><em>{lesson.progressPercent >= 100 ? "已完成" : `${lesson.progressPercent ?? 0}%`}</em></div>
      {!!lesson.learningSteps?.length && <section className="lesson-card__section"><strong>学习步骤</strong><ol>{lesson.learningSteps.map((step, stepIndex) => <li key={`${stepIndex}-${step}`}>{step}</li>)}</ol></section>}
      {lesson.practiceTask && <section className="lesson-card__section"><strong>练习任务</strong><p>{lesson.practiceTask}</p></section>}
      {lesson.completionCriteria && <section className="lesson-card__section"><strong>完成标准</strong><p>{lesson.completionCriteria}</p></section>}
      {lesson.requiresWorkSubmission && <section className="lesson-card__submission"><strong>提交本课作品</strong>{lesson.submission ? <p>已关联作品：{myWorks.find(work => work.id === lesson.submission.workId)?.title ?? lesson.submission.workId}</p> : <><p>先在案例社区保存自己的作品草稿，再关联到本课时。</p><div><select aria-label={`选择${lesson.title}的提交作品`} value="" onChange={event => void saveLessonWork(lesson.id, event.target.value)} disabled={loading}><option value="">选择我的作品</option>{myWorks.filter(work => ["draft", "rejected", "pending", "approved"].includes(work.status)).map(work => <option key={work.id} value={work.id}>{work.title} · {work.status}</option>)}</select><small>还没有作品？先前往案例社区创建草稿，保存后返回本课时。</small></div></>}</section>}
      <footer className="lesson-card__footer">{lesson.progressPercent >= 100 ? <b><CheckCircle size={17} weight="fill" /> 已完成 · 学习时长和今日任务已记录</b> : <><label><input type="checkbox" checked={Boolean(completionChecks[lesson.id])} onChange={event => setCompletionChecks(current => ({ ...current, [lesson.id]: event.target.checked }))} /> 我已完成本课时要求</label><button disabled={loading || !completionChecks[lesson.id] || (lesson.requiresWorkSubmission && !lesson.submission)} onClick={() => completeLesson(lesson.id)}>完成课时 <ArrowRight size={15} /></button></>}</footer>
    </article>)}</div>
    {selected.resources?.length > 0 && <section className="course-materials"><p>// COURSE MATERIALS</p><h3>课程资料</h3>{selected.resources.map((resource) => resource.resourceType === "video" ? <article className="course-material course-material--video" key={resource.id}>{resource.downloadUrl || resource.externalUrl ? <video controls preload="metadata" src={resource.downloadUrl ?? resource.externalUrl} aria-label={resource.title} /> : <div className="course-video-locked"><BookOpenText size={20} weight="bold" /><span>加入课程后可播放</span></div>}<div><strong>{resource.title}</strong><small>视频课程 · 仅已加入课程的账号可播放</small>{resource.transcriptText && <details><summary>查看文字稿</summary><p>{resource.transcriptText}</p></details>}</div></article> : <article className="course-material" key={resource.id}><BookOpenText size={18} weight="bold" /><span><strong>{resource.title}</strong><small>{({ pdf: "PDF", word: "WORD", ppt: "PPT" }[resource.resourceType] ?? resource.resourceType?.toUpperCase() ?? "FILE")} · 已纳入 AI 教学检索，学生端不开放原文件</small></span></article>)}</section>}
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
      <div className={`course-cover course-cover--${index % 3}`}><img src={COURSE_IMAGES[course.id] ?? FALLBACK_IMAGES[index % FALLBACK_IMAGES.length]} alt="" /><span>{course.method}</span></div>
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
