import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowClockwise, ArrowLeft, ArrowRight, ArrowsOutSimple, BookOpenText, CheckCircle, Clock, Code, FilePdf, Funnel, ImageSquare, Lock, PlayCircle, Presentation, SpinnerGap, Wrench, X } from "@phosphor-icons/react";
import { enrollCourse, getCourse, getCourses, updateLessonProgress } from "./services/adminApi.js";
import { coverImageFor } from "./coverImages.js";

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

export function LearningLibrary({ onNotice, initialCourseId = "" }) {
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

  /**
   * 首页、搜索结果和 Agent 回复里的「打开课程」都是 /learning?course=<id>，
   * 进到资源库后要直接把那门课展开。这个 effect 之前被误放进 SourcePreview
   * （那里没有 initialCourseId/openCourse，一渲染源码类课件就会整页报错），
   * 现在放回它该在的位置。
   */
  useEffect(() => {
    if (initialCourseId && !selected && !loading) void openCourse(initialCourseId);
  }, [initialCourseId]);

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
    {selected.resources?.length > 0 && <CourseMaterials resources={selected.resources} />}
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
    {filteredCourses.length ? <section className="course-grid">{filteredCourses.map((course) => <article className="course-card" key={course.id}>
      <div className="course-cover"><img src={coverImageFor(course, 240, 400)} alt="" /><span>{course.method}</span></div>
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

const MATERIAL_KINDS = {
  pdf: { label: "PDF 课件", icon: FilePdf },
  ppt: { label: "PPT 课件", icon: Presentation },
  word: { label: "Word 文档", icon: BookOpenText },
  video: { label: "教学视频", icon: PlayCircle },
  image: { label: "图片素材", icon: ImageSquare },
  web: { label: "前端界面", icon: Code },
  book: { label: "参考书", icon: BookOpenText },
  link: { label: "外部链接", icon: ArrowRight },
  other: { label: "课程资料", icon: BookOpenText },
};

const OFFICE_TYPES = ["ppt", "word"];

/**
 * 课程资料区按课件类型分别渲染：
 * 视频用播放器（可放大观看）、图片直接铺开、PDF 直接交给浏览器新标签页打开
 * —— 不再塞进页面里的小窗口；网页课件仍在页内预览、Office 原件浏览器无法内嵌预览，
 * 因此给出下载入口由学生本地打开。没有 previewUrl 说明账号还没加入课程。
 */
function CourseMaterials({ resources }) {
  return <section className="course-materials">
    <p>// COURSE MATERIALS</p>
    <h3>课程资料</h3>
    <small className="course-materials__note">PDF 课件由浏览器自己的阅读器在新标签页打开，不再嵌在页面里的小窗口中；视频可在页内播放或放大观看；只有 PPT / Word 因为浏览器无法渲染，需要下载后用本机软件打开。</small>
    <div className="course-material-list">{resources.map((resource) => <CourseMaterial key={resource.id} resource={resource} />)}</div>
  </section>;
}

/**
 * 视频课件：默认页内播放，另外给一个「放大观看」入口。
 * 放大走页面内的浮层而不是新标签页——课件上下文（进度、跟随的课时）留在原页面，
 * 关掉浮层就能继续；放大后的播放器仍带原生控件，需要全屏时再按播放器的全屏键。
 */
function VideoMaterial({ resource, source, cover, meta }) {
  const [enlarged, setEnlarged] = useState(false);
  useEffect(() => {
    if (!enlarged) return undefined;
    const onKeyDown = (event) => { if (event.key === "Escape") setEnlarged(false); };
    window.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [enlarged]);

  // 浮层必须挂到 body：`.route-transition` 的入场动画会留下 transform，
  // 而 transform 会让 position: fixed 相对这个容器定位，浮层就会跑到视口外。
  // 仓库里其他弹层（课程编辑、案例编辑器、工作流播放器）同样用 createPortal。
  return <>
    <article className="course-material course-material--video">
      <video controls preload="metadata" src={source} poster={cover} aria-label={resource.title} />
      <div>
        {meta("仅提供在线播放；加入课程后即可观看")}
        <button type="button" className="course-material__expand" onClick={() => setEnlarged(true)}>
          <ArrowsOutSimple size={14} weight="bold" />放大观看
        </button>
        {resource.transcriptText && <details><summary>查看文字稿</summary><p>{resource.transcriptText}</p></details>}
      </div>
    </article>
    {enlarged && createPortal(<div className="course-material-lightbox" role="dialog" aria-modal="true" aria-label={`${resource.title}（放大观看）`}>
      <button type="button" className="course-material-lightbox__scrim" aria-label="关闭放大观看" onClick={() => setEnlarged(false)} />
      <div className="course-material-lightbox__panel">
        <header>
          <strong>{resource.title}</strong>
          <button type="button" onClick={() => setEnlarged(false)} aria-label="关闭放大观看"><X size={18} weight="bold" /></button>
        </header>
        <video controls autoPlay playsInline src={source} poster={cover} aria-label={`${resource.title}（放大）`} />
        <small>按 Esc 或点击空白处退出；需要更大画面时用播放器自带的全屏按钮。</small>
      </div>
    </div>, document.body)}
  </>;
}

function CourseMaterial({ resource }) {
  const kind = MATERIAL_KINDS[resource.resourceType] ?? MATERIAL_KINDS.other;
  const Icon = kind.icon;
  const preview = resource.previewUrl || resource.externalUrl || "";
  const download = resource.downloadUrl || "";
  const source = preview || download;
  const fileName = resource.fileName ? ` · ${resource.fileName}` : "";
  // 封面优先用上传的图片；没上传时由标题生成白底黑字图，保证资料列表始终有可扫读的视觉。
  const cover = coverImageFor(resource, 480, 270);
  const meta = (note) => <span className="course-material__meta">
    <img className="course-material-cover" src={cover} alt="" />
    <strong>{resource.title}</strong>
    <small>{kind.label}{fileName}</small>
    {note && <small>{note}</small>}
  </span>;
  // 下载是备选方案，统一做成弱化的小字链接；只有浏览器确实无法预览的 Office 才用按钮。
  const downloadLink = (label) => download
    ? <a className="course-material__download" href={download} rel="noreferrer">{label}</a>
    : null;
  const downloadButton = (label) => download
    ? <a className="outline-button" href={download} rel="noreferrer">{label}</a>
    : null;

  if (!source) return <article className="course-material course-material--locked">
    <Lock size={18} weight="bold" />
    {meta("加入课程后可在线预览")}
  </article>;

  if (resource.resourceType === "video") return <VideoMaterial resource={resource} source={source} cover={cover} meta={meta} />;

  if (resource.resourceType === "image") return <article className="course-material course-material--image">
    <a href={source} target="_blank" rel="noreferrer"><img loading="lazy" src={source} alt={resource.title} /></a>
    {meta("点击图片可查看原图。")}
    {downloadLink("下载原图")}
  </article>;

  // 单文件网页课件只在页内预览：能完整看到效果，就不再分发原件。
  if (resource.mimeType === "text/html") return <article className="course-material course-material--document">
    <header>
      {meta("仅提供在线预览；如需在本机运行，请找课程老师获取源文件。")}
      <span className="course-material__actions">
        <a className="outline-button" href={source} target="_blank" rel="noreferrer">新窗口打开</a>
      </span>
    </header>
    <iframe src={source} title={resource.title} loading="lazy" referrerPolicy="no-referrer" />
  </article>;

  // PDF 交给浏览器自己的阅读器：新标签页整页阅读，不再嵌进页面里的小窗口。
  // 嵌在小窗口里既看不清，又会因为沙箱化的 iframe 丢掉浏览器自带的缩放、目录和下载。
  if (resource.resourceType === "pdf") return <article className="course-material course-material--document course-material--pdf">
    <header>
      {meta("用浏览器阅读器打开，可整页缩放、翻页与检索；需要离线使用时再下载原件。")}
      <span className="course-material__actions">
        <a className="outline-button course-material__open" href={source} target="_blank" rel="noreferrer"><FilePdf size={16} weight="bold" />在浏览器中打开 PDF</a>
        {downloadLink("下载 PDF")}
      </span>
    </header>
  </article>;

  // 前端源码课件（.css / .js）：页内查看源码为主，下载只作为备选。
  if (!OFFICE_TYPES.includes(resource.resourceType)) return <article className="course-material course-material--source">
    <Code size={18} weight="bold" />
    {meta("源码可在页内查看；需要引用到本机项目时再下载原件。")}
    <SourcePreview url={source} title={resource.title} />
    {downloadLink("下载源文件")}
  </article>;

  // Office 原件浏览器无法渲染，下载后本地打开是唯一可行方式。
  return <article className="course-material">
    <Icon size={18} weight="bold" />
    {meta("浏览器不能内嵌渲染 Office 原件：下载后用本机 PowerPoint / WPS 打开。")}
    {downloadButton("下载课件")}
  </article>;
}

/** 文本类课件（.css / .js）在页内查看源码，避免为了看一眼就去下载。 */
function SourcePreview({ url, title }) {
  const [state, setState] = useState({ loading: false, text: "", error: "" });
  const load = async () => {
    setState((current) => ({ ...current, loading: true }));
    try {
      const response = await fetch(url, { credentials: "include" });
      if (!response.ok) throw new Error("源码读取失败，请稍后重试");
      setState({ loading: false, text: (await response.text()).slice(0, 20000), error: "" });
    } catch (error) {
      setState({ loading: false, text: "", error: error.message ?? "源码读取失败" });
    }
  };

  return <details className="course-material__code" onToggle={(event) => { if (event.currentTarget.open && !state.text && !state.loading) void load(); }}>
    <summary>查看{title ? `「${title}」` : ""}源码</summary>
    {state.loading && <p>正在读取源码…</p>}
    {state.error && <p>{state.error}</p>}
    {state.text && <pre>{state.text}</pre>}
  </details>;
}
