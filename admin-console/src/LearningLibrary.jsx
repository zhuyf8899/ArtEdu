import {lockPageScroll} from './pageScrollLock.js';
/**
 * 【课程页面】从 API 加载目录与课程详情，处理选课、课时进度和资料展示。读代码时先找组件状态与 useEffect，再追一个按钮的处理函数；对应后端在 modules/courses。这里的界面限制不能代替后端权限校验。
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowClockwise, ArrowLeft, ArrowRight, ArrowsOutSimple, BookOpenText, CheckCircle, Clock, Code, FilePdf, Funnel, ImageSquare, Lock, PlayCircle, Presentation, SpinnerGap, UserCircle, Wrench, X } from "@phosphor-icons/react";
import { enrollCourse, getCourse, getCourses, getMyWorks, submitLessonWork, updateLessonProgress } from "./services/adminApi.js";
import { coverImageFor } from "./coverImages.js";
import { decorateCourse, difficultyName, courseReadiness } from "./coursePresentation.js";
import { TrialLesson } from './morph/TrialLesson.jsx';
import { learningLabels } from "./learningBindings.js";
import { ZoomableImage } from "./ImageLightbox.jsx";
import { DocumentPreviewDialog } from './DocumentPreview.jsx';
import "./LearningBindings.css";
import { MorphCourseCatalog } from './morph/MorphCatalog.jsx';
import { morphCourseLevel } from './morph/morphPresentation.js';
import { courseProgress, mergeCourseRecord } from './courseProgress.js';
import { courseCardState } from './morph/curriculumModel.js';
import { returnContext, withReturnTarget } from './resourceContext.js';

const METHOD_FILTERS = ["全部", "UI 创作", "图案生成", "Vibe Coding"];

export function LearningLibrary({ onNotice, onNavigate, onCourseChange, initialCourseId = "", initialLessonId = "", variant = 'classic', accountId = '' }) {
  const [courses, setCourses] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState("");
  const [detailError, setDetailError] = useState('');
  const [methodFilter, setMethodFilter] = useState("全部");
  const [authorFilter, setAuthorFilter] = useState("全部作者");
  const [toolFilter, setToolFilter] = useState("全部工具");
  // 学习闭环：本课时的作品关联与"我已完成本课时要求"的确认勾选。
  const [myWorks, setMyWorks] = useState([]);
  const [completionChecks, setCompletionChecks] = useState({});
  const lessonNodes = useRef(new Map());
  const courseRequest = useRef(0);
  const catalogRequest = useRef(0);
  const [openLesson,setOpenLesson]=useState('');
  const context=returnContext();

  const loadCatalog = async () => {
    const requestId = ++catalogRequest.current;
    setCatalogLoading(true);
    setCatalogError("");
    try { const payload = await getCourses(); if (requestId === catalogRequest.current) setCourses(payload.items ?? []); }
    catch (error) { if (requestId === catalogRequest.current) { setCatalogError(error.message); onNotice(error.message); } }
    finally { if (requestId === catalogRequest.current) setCatalogLoading(false); }
  };

  // Returning from a detail URL must revalidate the catalog, including browser Back.
  useEffect(() => { void loadCatalog(); return () => { catalogRequest.current++; }; }, [initialCourseId]);

  const acceptCourse = (course, saved = false) => {
    if (saved) {
      // An older catalog request must not overwrite the successful save response.
      catalogRequest.current++;
      setCatalogLoading(false);
      setCatalogError('');
    }
    setSelected(decorateCourse(course));
    setOpenLesson(current=>course.lessons?.some(lesson=>lesson.id===current)?current:(initialLessonId||course.lessons?.find(lesson=>lesson.progressPercent<100)?.id||course.lessons?.[0]?.id||''));
    setCourses(current => mergeCourseRecord(current, course));
    onCourseChange?.(course);
  };

  /**
   * 首页、搜索结果和 Agent 回复里的「打开课程」都是 /learning?course=<id>，
   * 进到资源库后要直接把那门课展开。这个 effect 之前被误放进 SourcePreview
   * （那里没有 initialCourseId/openCourse，一渲染源码类课件就会整页报错），
   * 现在放回它该在的位置。
   */
  useEffect(() => {
    if (initialCourseId && selected?.id !== initialCourseId) { setSelected(null); void openCourse(initialCourseId); }
    if (!initialCourseId && onNavigate) { courseRequest.current++; setSelected(null); setLoading(false); }
    return () => { courseRequest.current++; };
  }, [initialCourseId]);

  // Deep links focus only a published lesson returned by this course, never another course's ID.
  useEffect(() => {
    const target = selected?.id === initialCourseId && lessonNodes.current.get(initialLessonId);
    if (target) {setOpenLesson(initialLessonId);requestAnimationFrame(()=>{target.scrollIntoView({ block: "start" }); target.focus({ preventScroll: true });});}
  }, [selected?.id, initialCourseId, initialLessonId]);

  const showCourse = (courseId) => onNavigate ? onNavigate(withReturnTarget(`/learning?course=${encodeURIComponent(courseId)}`)) : openCourse(courseId);
  const returnToCatalog = () => { courseRequest.current++; setSelected(null); if(onNavigate) onNavigate(context.to||"/learning?library=courses"); };
  const openCourse = async (courseId) => {
    // 请求编号防止快速切换课程时，较早请求的结果覆盖后来选中的课程。
    const requestId = ++courseRequest.current;
    setLoading(true);
    setDetailError('');
    try {
      // 两个独立请求一起发出，等它们都成功再更新界面。
      const [course, works] = await Promise.all([getCourse(courseId), getMyWorks()]);
      if (requestId !== courseRequest.current) return;
      acceptCourse(course); setMyWorks(works.items ?? []); setCompletionChecks({});
    }
    catch (error) { if (requestId === courseRequest.current) {setDetailError(error.message);onNotice(error.message);} }
    finally { if (requestId === courseRequest.current) setLoading(false); }
  };

  const enroll = async () => {
    setLoading(true);
    try { acceptCourse(await enrollCourse(selected.id), true); onNotice("课程已加入“我的学习”"); }
    catch (error) { onNotice(error.message); }
    finally { setLoading(false); }
  };

  const completeLesson = async (lessonId) => {
    setLoading(true);
    try { acceptCourse(await updateLessonProgress(selected.id, lessonId, 100, { completionConfirmed: true }), true); onNotice("课时已完成，学习时长、课程进度与今日任务已同步"); }
    catch (error) { onNotice(error.message); }
    finally { setLoading(false); }
  };

  const saveLessonWork = async (lessonId, workId) => {
    if (!workId) return;
    setLoading(true);
    try {
      acceptCourse(await submitLessonWork(selected.id, lessonId, { workId }), true);
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
    <div className="learning-detail-navigation"><button className="learning-back" onClick={returnToCatalog}><ArrowLeft size={16} weight="bold" /> {context.to?context.label:'返回完整课程'}</button>{onNavigate&&<button className="atomic-button secondary" onClick={()=>onNavigate(withReturnTarget('/learning?library=atoms&query='+encodeURIComponent(selected.title)))}>查找相关原子 ↗</button>}</div>
    <div className="learning-detail__hero"><div><span>{selected.method} · {selected.category} · {variant === 'morph' ? morphCourseLevel(selected) : difficultyName(selected.difficulty)}</span><h2>{selected.title}</h2><p>{selected.summary}</p><div><Clock size={16} /> {selected.estimatedMinutes} 分钟{selected.availability==='coming_soon'?'（规划时长）':` · ${selected.lessonCount} 个课时`} · 作者 {selected.author}</div><div className="learning-detail__tools"><Wrench size={15} /> {selected.tools.join(" / ")}</div></div>
      <aside className={courseProgress(selected)>=100?'is-complete':''} aria-label="课程学习进度">
        <strong>{selected.availability==='coming_soon'?'筹备中':`${courseProgress(selected)}%`}</strong>
        <span>{selected.availability==='coming_soon'?'暂未开放选课':`${selected.lessons.filter(lesson=>lesson.progressPercent>=100).length} / ${selected.lessonCount} 课时已完成`}</span>
        {selected.availability!=='coming_soon'&&<progress className="detail-learning-progress" aria-label={`${selected.title}学习进度`} aria-valuetext={`${courseCardState(selected).label}，${courseProgress(selected)}%`} max="100" value={courseProgress(selected)}/>}
        {['in_progress','completed'].includes(selected.enrollmentStatus) ? <em>{courseCardState(selected).label==='未开始'?'已加入学习':courseCardState(selected).label}</em> : <button disabled={loading||selected.availability==='coming_soon'} onClick={enroll}><PlayCircle size={18} weight="fill" /> {selected.availability==='coming_soon'?'教学资料筹备中':selected.availability==='trial'?'加入试学':'加入课程'}</button>}
      </aside>
    </div>
    {courseReadiness(selected)&&<p className="catalog-notice">{courseReadiness(selected)}。{selected.availability==='coming_soon'?'课程筹备中，暂未开放选课。':'试学内容正在教研完善中。带着问题阅读，在练习中形成自己的判断；你的学习进度将持续保存。'}</p>}
    {selected.catalog?.tools?.length>0&&<section className="course-tools-links" aria-label="相关技能工具">{selected.catalog.tools.map(tool=><button key={tool} onClick={()=>onNavigate(withReturnTarget(`/studio?toolQuery=${encodeURIComponent(tool)}`))}>探索 {tool} ↗</button>)}</section>}
    {/* 课时卡把"分步学习 → 练习 → 完成标准 →（可选）关联作品 → 确认完成"整条闭环摆出来。 */}
    {learningLabels(selected.knowledgePoints).length > 0 && <section className="lesson-knowledge"><strong>这门课涉及的知识</strong><div>{learningLabels(selected.knowledgePoints).map((point) => <span key={point}>{point}</span>)}</div><small>本页为既有课程记录，进度保存在“我的课程”。专业画像单独统计新教学原子的学习证据，不将试学进度推断为能力认证。</small></section>}
    {selected.lessons.length>0&&<nav className="lesson-outline" aria-label="课时目录">{selected.lessons.map((lesson,index)=><button key={lesson.id} aria-current={openLesson===lesson.id?'step':undefined} onClick={()=>{setOpenLesson(lesson.id);requestAnimationFrame(()=>lessonNodes.current.get(lesson.id)?.scrollIntoView({block:'start',behavior:'smooth'}));}}><span>{index+1}</span>{lesson.title}<small>{lesson.progressPercent>=100?'已完成':'继续学习'}</small></button>)}</nav>}
    <div className="lesson-list">{selected.lessons.map((lesson, index) => <article className={`lesson-card ${lesson.id === initialLessonId ? "lesson-card--recommended" : ""}`} key={lesson.id} tabIndex={-1} ref={(node) => { if (node) lessonNodes.current.set(lesson.id, node); else lessonNodes.current.delete(lesson.id); }}>
      {lesson.id === initialLessonId && <span className="lesson-card__recommendation-label">本次推荐课时 · 从这里继续学习</span>}
      {learningLabels(lesson.knowledgePoints).length > 0 && <section className="lesson-knowledge"><strong>本课时知识点</strong><div>{learningLabels(lesson.knowledgePoints).map((point) => <span key={point}>{point}</span>)}</div></section>}
      <div className="lesson-card__heading"><span>{String(index + 1).padStart(2, "0")}</span><div><small>{lesson.lessonType === "workflow" ? "AI 工作流实践" : lesson.lessonType === "practice" ? "动手练习" : lesson.lessonType === "assignment" ? "课时作业" : "课程课时"} · {lesson.estimatedMinutes} 分钟</small><strong>{lesson.title}</strong><p>{lesson.summary}</p></div><em>{lesson.progressPercent >= 100 ? "已完成" : `${lesson.progressPercent ?? 0}%`}</em></div>
      <button className="lesson-expand" aria-expanded={openLesson===lesson.id} aria-controls={'lesson-body-'+lesson.id} onClick={()=>setOpenLesson(openLesson===lesson.id?'':lesson.id)}>{openLesson===lesson.id?'收起课时':'展开课时与练习'}</button><div id={'lesson-body-'+lesson.id} hidden={openLesson!==lesson.id}>
      <TrialLesson teaching={lesson.teaching}/>
      {!!lesson.learningSteps?.length && <section className="lesson-card__section"><strong>学习步骤</strong><ol>{lesson.learningSteps.map((step, stepIndex) => <li key={`${stepIndex}-${step}`}>{step}</li>)}</ol></section>}
      {lesson.practiceTask && <section className="lesson-card__section"><strong>练习任务</strong><p>{lesson.practiceTask}</p></section>}
      {lesson.completionCriteria && <section className="lesson-card__section"><strong>完成标准</strong><p>{lesson.completionCriteria}</p></section>}
      {lesson.requiresWorkSubmission && <section className="lesson-card__submission"><strong>提交本课作品</strong>{lesson.submission ? <p>已关联作品：{myWorks.find(work => work.id === lesson.submission.workId)?.title ?? lesson.submission.workId}</p> : <><p>先在案例社区保存自己的作品草稿，再关联到本课时。</p><div><select aria-label={`选择${lesson.title}的提交作品`} value="" onChange={event => void saveLessonWork(lesson.id, event.target.value)} disabled={loading}><option value="">选择我的作品</option>{myWorks.filter(work => ["draft", "rejected", "pending", "approved"].includes(work.status)).map(work => <option key={work.id} value={work.id}>{work.title} · {work.status}</option>)}</select><small>还没有作品？先前往案例社区创建草稿，保存后返回本课时。</small></div></>}</section>}
      <footer className="lesson-card__footer">{lesson.progressPercent >= 100 ? <b><CheckCircle size={17} weight="fill" /> 已完成 · 学习时长和今日任务已记录</b> : <><label><input type="checkbox" checked={Boolean(completionChecks[lesson.id])} onChange={event => setCompletionChecks(current => ({ ...current, [lesson.id]: event.target.checked }))} /> 我已完成本课时要求</label><button disabled={loading || !completionChecks[lesson.id] || (lesson.requiresWorkSubmission && !lesson.submission)} onClick={() => completeLesson(lesson.id)}>完成课时 <ArrowRight size={15} /></button></>}</footer>
      </div>
    </article>)}</div>
    {selected.resources?.length > 0 && <CourseMaterials resources={selected.resources} />}
  </section>;

  if (initialCourseId) return detailError ? <section className="resource-load-state resource-load-state--error" role="alert"><strong>课程暂时无法打开</strong><p>{detailError}</p><button onClick={()=>openCourse(initialCourseId)}>重新加载课程</button><button onClick={returnToCatalog}>{context.to?context.label:'返回完整课程'}</button></section> : <section className="resource-load-state" aria-busy="true"><SpinnerGap size={32} className="spin"/><strong>正在打开课程…</strong><p>正在同步课时与学习进度。</p></section>;
  if (catalogLoading) return <section className="resource-load-state" aria-busy="true"><SpinnerGap size={32} className="spin" /><strong>正在加载{variant==='morph'?'原子课程':' AI 讲堂'}</strong></section>;
  if (catalogError) return <section className="resource-load-state resource-load-state--error"><ArrowClockwise size={31} weight="bold" /><strong>{variant==='morph'?'原子课程':'AI 讲堂'}暂时无法加载</strong><p>{catalogError}</p><button onClick={loadCatalog}>重新加载</button></section>;

  if (variant === 'morph') return <>{detailError&&initialCourseId&&<div className="catalog-notice" role="alert">{detailError}<button onClick={returnToCatalog}>{context.to?context.label:'返回课程库'}</button></div>}<MorphCourseCatalog embedded accountId={accountId} courses={courses} onOpen={showCourse} onNavigate={onNavigate} /></>;
  return <>
    <section className="learning-library-intro" aria-labelledby="learning-library-title">
      <div className="learning-library-intro__copy">
        <p className="learning-library-intro__eyebrow">ARTEDU · AI LEARNING</p>
        <div className="learning-library-intro__title-row"><h1 id="learning-library-title">AI 讲堂</h1><span>{decoratedCourses.length} 门课程</span></div>
        <p>从 UI 创作、图案生成到 Vibe Coding，跟着课程把灵感一步步变成作品。</p>
      </div>
      <div className="learning-method-picker" aria-label="按创作方法筛选">
        <div><strong>从哪种方法开始？</strong><span>选择创作路径，快速找到课程</span></div>
        <div className="learning-method-picker__options">
          {METHOD_FILTERS.map((method) => <button key={method} className={methodFilter === method ? "is-active" : ""} aria-pressed={methodFilter === method} onClick={() => setMethodFilter(method)}>{method}</button>)}
        </div>
      </div>
    </section>
    <section className="resource-filters" aria-label="课程资源筛选">
      <div className="resource-filters__title"><Funnel size={19} weight="bold" /><div><strong>按作者或工具筛选</strong><span>当前显示 {filteredCourses.length} / {decoratedCourses.length} 门课程</span></div>{(authorFilter !== "全部作者" || toolFilter !== "全部工具" || methodFilter !== "全部") && <button type="button" className="resource-filters__reset" onClick={resetFilters}>清除筛选</button>}</div>
      <FilterRow label="作者" items={["全部作者", ...authors]} value={authorFilter} onChange={setAuthorFilter} />
      <FilterRow label="使用工具" items={["全部工具", ...tools]} value={toolFilter} onChange={setToolFilter} />
    </section>
    {filteredCourses.length ? <section className="course-grid">{filteredCourses.map((course) => <article className="course-card" key={course.id}>
      <div className="course-cover"><img src={coverImageFor(course, 240, 400)} alt="" /><span>{course.method}</span></div>
      <div className="course-card__content">
        <div className="course-card__tags"><b>{course.method}</b><span>{course.category}</span></div>
        <small className="course-card__level"><Clock size={14} /> {course.lessonCount ?? 0} 个课时 <span aria-hidden="true">·</span> {difficultyName(course.difficulty)}</small>
        <h3>{course.title}</h3><p className="course-card__summary">{course.summary}</p>
        <div className="course-card__meta" aria-label="课程作者与使用工具">
          <div className="course-card__meta-row"><UserCircle size={17} weight="bold" /><span>授课作者</span><strong>{course.author}</strong></div>
          <div className="course-card__meta-row"><Wrench size={17} weight="bold" /><span>创作工具</span><div className="course-card__tools">{course.tools.map((tool, index) => <strong key={`${tool}-${index}`}>{tool}</strong>)}</div></div>
        </div>
        <div className="course-card__footer"><div className="course-card__progress"><span>学习进度</span><i><b style={{ width: `${course.progressPercent ?? 0}%` }} /></i><strong>{course.progressPercent ?? 0}%</strong></div><button disabled={loading} onClick={() => showCourse(course.id)} aria-label={`打开${course.title}`}><ArrowRight size={18} weight="bold" /></button></div>
      </div>
    </article>)}</section> : <section className="resource-empty"><strong>没有符合当前标签的课程</strong><p>可以减少一个筛选条件，或返回查看全部资源。</p><button onClick={resetFilters}>清除筛选</button></section>}
  </>;
}

function FilterRow({ label, items, value, onChange }) {
  return <div className="filter-row"><span>{label}</span><div>{items.map((item) => <button key={item} className={value === item ? "is-active" : ""} onClick={() => onChange(item)}>{item}</button>)}</div></div>;
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
    const unlockPage=lockPageScroll();
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      unlockPage();
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
          <strong>视频预览</strong>
          <button type="button" onClick={() => setEnlarged(false)} aria-label="关闭放大观看"><X size={18} weight="bold" /></button>
        </header>
        <video controls autoPlay playsInline src={source} poster={cover} aria-label={`${resource.title}（放大）`} />
        <small>按 Esc 或点击空白处退出；需要更大画面时用播放器自带的全屏按钮。</small>
      </div>
    </div>, document.body)}
  </>;
}

function CourseMaterial({ resource }) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const kind = MATERIAL_KINDS[resource.resourceType] ?? MATERIAL_KINDS.other;
  const Icon = kind.icon;
  const preview = resource.previewUrl || resource.externalUrl || "";
  const download = resource.downloadUrl || "";
  const source = preview || download;
  const isMedia = ["image", "video"].includes(resource.resourceType);
  const fileName = !isMedia && resource.fileName ? ` · ${resource.fileName}` : "";
  // 媒体不再生成带名称的文字海报；保留作者上传的封面，没封面的视频用原生首帧。
  const cover = isMedia ? resource.coverImageUrl || resource.coverUrl || undefined : coverImageFor(resource, 480, 270);
  const meta = (note) => <span className="course-material__meta">
    {!isMedia && <><img className="course-material-cover" src={cover} alt="" /><strong>{resource.title}</strong><small>{kind.label}{fileName}</small></>}
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
    <ZoomableImage src={source} alt="课程配图" fileName={resource.fileName || ""} />
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
        <button type="button" className="course-material__preview-button" onClick={() => setPreviewOpen(true)}>在线预览 PDF</button>
        <a className="outline-button course-material__open" href={source} target="_blank" rel="noreferrer"><FilePdf size={16} weight="bold" />在浏览器中打开 PDF</a>
        {downloadLink("下载 PDF")}
      </span>
    </header>
    {previewOpen && <DocumentPreviewDialog fileName={resource.fileName || `${resource.title}.pdf`} src={source} mimeType={resource.mimeType} downloadUrl={download} onClose={() => setPreviewOpen(false)} />}
  </article>;

  // 前端源码课件（.css / .js）：页内查看源码为主，下载只作为备选。
  if (!OFFICE_TYPES.includes(resource.resourceType)) return <article className="course-material course-material--source">
    <Code size={18} weight="bold" />
    {meta("源码可在页内查看；需要引用到本机项目时再下载原件。")}
    <SourcePreview url={source} title={resource.title} />
    {downloadLink("下载源文件")}
  </article>;

  // Office 原件由浏览器本机解析；沿用原有鉴权下载接口，不发送给在线预览服务。
  return <article className="course-material">
    <Icon size={18} weight="bold" />
    {meta("支持 DOCX / PPTX 在线阅读与翻页；复杂动画与旧版格式请下载原件查看。")}
    <button type="button" className="course-material__preview-button" onClick={() => setPreviewOpen(true)}>在线预览</button>
    {downloadLink("下载原件")}
    {previewOpen && <DocumentPreviewDialog fileName={resource.fileName || resource.title} src={source} mimeType={resource.mimeType} downloadUrl={download} onClose={() => setPreviewOpen(false)} />}
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
