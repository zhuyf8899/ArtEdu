import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight, BookOpenText, BookmarkSimple, CalendarCheck, Check,
  Clock, FileText, Heart, House, ImageSquare, NotePencil, Plus, Sparkle,
  Student, Target, Trash, TrendUp,
} from "@phosphor-icons/react";
import {
  createLearningNote,
  createLearningTask,
  deleteLearningNote,
  deleteLearningTask,
  getLearningSpace,
  updateLearningTask,
} from "./services/adminApi.js";

const COURSE_IMAGES = {
  "course-ai-design-foundation": "/assets/learning/ai-design-foundations.jpg",
  "course-traditional-pattern": "/assets/learning/traditional-patterns.jpg",
  "course-vibe-gallery": "/assets/learning/vibe-coding.jpg",
};

const FALLBACK_IMAGES = Object.values(COURSE_IMAGES);

const EMPTY_DATA = {
  profile: { displayName: "学习者", roles: [] },
  summary: { enrolledCourses: 0, completedLessons: 0, totalLessons: 0, weeklyMinutes: 0, pendingTasks: 0, completionPercent: 0 },
  courses: [], tasks: [], notes: [], favorites: [], works: [], workflowRuns: [],
};

const VIEWS = [
  ["overview", "学习首页", House],
  ["courses", "我的课程", BookOpenText],
  ["plan", "学习计划", CalendarCheck],
  ["notes", "学习笔记", NotePencil],
  ["favorites", "收藏案例", BookmarkSimple],
  ["works", "我的作品", ImageSquare],
];

export function MyLearning({ account, onNavigate, onNotice }) {
  const [data, setData] = useState(EMPTY_DATA);
  const [view, setView] = useState("overview");
  const [loading, setLoading] = useState(true);
  const [taskForm, setTaskForm] = useState({ title: "", dueDate: "" });
  const [noteForm, setNoteForm] = useState({ title: "", content: "", courseId: "" });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try { setData(await getLearningSpace()); }
    catch (error) { onNotice(error.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [account.id]);

  const pendingTasks = useMemo(() => data.tasks.filter((task) => task.status === "pending"), [data.tasks]);
  const displayName = data.profile?.displayName || account.shortName;

  const toggleTask = async (task) => {
    try {
      const next = await updateLearningTask(task.id, { status: task.status === "completed" ? "pending" : "completed" });
      setData((current) => ({ ...current, tasks: current.tasks.map((item) => item.id === task.id ? next : item) }));
    } catch (error) { onNotice(error.message); }
  };

  const addTask = async (event) => {
    event.preventDefault();
    if (!taskForm.title.trim()) return;
    setSaving(true);
    try {
      const task = await createLearningTask({ title: taskForm.title, taskType: "custom", ...(taskForm.dueDate ? { dueDate: taskForm.dueDate } : {}) });
      setData((current) => ({ ...current, tasks: [task, ...current.tasks] }));
      setTaskForm({ title: "", dueDate: "" });
      onNotice("学习任务已加入计划");
    } catch (error) { onNotice(error.message); }
    finally { setSaving(false); }
  };

  const removeTask = async (taskId) => {
    try {
      await deleteLearningTask(taskId);
      setData((current) => ({ ...current, tasks: current.tasks.filter((task) => task.id !== taskId) }));
      onNotice("学习任务已移除");
    } catch (error) { onNotice(error.message); }
  };

  const addNote = async (event) => {
    event.preventDefault();
    if (!noteForm.title.trim() || !noteForm.content.trim()) return;
    setSaving(true);
    try {
      const note = await createLearningNote({
        title: noteForm.title,
        content: noteForm.content,
        ...(noteForm.courseId ? { courseId: noteForm.courseId } : {}),
      });
      const course = data.courses.find((item) => item.id === noteForm.courseId);
      setData((current) => ({ ...current, notes: [{ ...note, courseTitle: course?.title ?? null }, ...current.notes] }));
      setNoteForm({ title: "", content: "", courseId: "" });
      onNotice("学习笔记已保存");
    } catch (error) { onNotice(error.message); }
    finally { setSaving(false); }
  };

  const removeNote = async (noteId) => {
    try {
      await deleteLearningNote(noteId);
      setData((current) => ({ ...current, notes: current.notes.filter((note) => note.id !== noteId) }));
      onNotice("学习笔记已删除");
    } catch (error) { onNotice(error.message); }
  };

  return <section className="my-learning-page">
    <header className="my-learning-heading">
      <div><p className="eyebrow">// PERSONAL LEARNING SPACE</p><h1>我的学习</h1><p>继续课程、安排计划，并沉淀每一次创作与反思。</p></div>
      <div className="my-learning-heading__status"><span>本周学习</span><strong>{data.summary.weeklyMinutes}</strong><em>分钟</em></div>
    </header>

    <div className="learning-space">
      <aside className="learning-rail" aria-label="我的学习导航">
        <div className="learning-rail__brand"><Student size={23} weight="duotone" /><div><strong>学习空间</strong><span>YOUR LEARNING SPACE</span></div></div>
        <nav>{VIEWS.map(([id, label, Icon]) => <button key={id} className={view === id ? "is-active" : ""} onClick={() => setView(id)}><Icon size={17} weight={view === id ? "fill" : "bold"} /><span>{label}</span>{id === "plan" && pendingTasks.length > 0 && <b>{pendingTasks.length}</b>}</button>)}</nav>
        <div className="learning-rail__account"><span>{account.shortName.slice(0, 1)}</span><div><strong>{account.shortName}</strong><small>{account.roleLabel}</small></div></div>
      </aside>

      <div className="learning-content" aria-busy={loading}>
        {loading ? <LearningLoading /> : <>
          {view === "overview" && <Overview data={data} displayName={displayName} onView={setView} onToggleTask={toggleTask} onNavigate={onNavigate} />}
          {view === "courses" && <CoursesView courses={data.courses} onNavigate={onNavigate} />}
          {view === "plan" && <PlanView tasks={data.tasks} form={taskForm} setForm={setTaskForm} saving={saving} onSubmit={addTask} onToggle={toggleTask} onDelete={removeTask} />}
          {view === "notes" && <NotesView notes={data.notes} courses={data.courses} form={noteForm} setForm={setNoteForm} saving={saving} onSubmit={addNote} onDelete={removeNote} />}
          {view === "favorites" && <WorksView title="收藏案例" eyebrow="// SAVED CASES" items={data.favorites} empty="还没有收藏案例" onNavigate={() => onNavigate("/community")} />}
          {view === "works" && <WorksView title="我的作品" eyebrow="// MY CREATIONS" items={data.works} empty="还没有发布作品" onNavigate={() => onNavigate("/community")} />}
        </>}
      </div>
    </div>
  </section>;
}

function Overview({ data, displayName, onView, onToggleTask, onNavigate }) {
  const courses = data.courses.slice(0, 3);
  const tasks = data.tasks.slice(0, 4);
  return <>
    <div className="learning-welcome"><div><span>// KEEP CREATING</span><h2>欢迎回来，{displayName}</h2><p>把今天的小进展，积累成可以复用的创作方法。</p></div><Sparkle size={34} weight="duotone" /></div>

    <section className="learning-dashboard-grid">
      <div className="learning-dashboard-main">
        <article className="learning-goal-card">
        <div className="learning-goal-card__icon"><Target size={36} weight="duotone" /></div>
        <div><span>本周学习目标</span><strong>{data.summary.completedLessons} / {data.summary.totalLessons || 0} <small>节课时</small></strong><i><b style={{ width: `${data.summary.completionPercent}%` }} /></i></div>
        <dl><div><dt>已加入</dt><dd>{data.summary.enrolledCourses} 门课程</dd></div><div><dt>本周已学</dt><dd>{data.summary.weeklyMinutes} 分钟</dd></div></dl>
        </article>
        <SectionHeader eyebrow="// CONTINUE LEARNING" title="继续学习" action="查看全部课程" onAction={() => onView("courses")} />
        {courses.length ? <div className="continue-learning-list">{courses.map((course, index) => <CourseRow key={course.id} course={course} index={index} onNavigate={onNavigate} />)}</div> : <EmptyBlock icon={BookOpenText} title="还没有加入课程" text="从教学资源库选择一门课程，开始建立你的学习路径。" action="浏览课程" onAction={() => onNavigate("/learning")} />}
        <SectionHeader eyebrow="// SAVED CASES" title="我的收藏" action="查看全部" onAction={() => onView("favorites")} />
        {data.favorites.length ? <div className="learning-mini-grid">{data.favorites.slice(0, 3).map((work, index) => <WorkMiniCard key={work.id} work={work} index={index} onClick={() => onNavigate("/community")} />)}</div> : <EmptyInline text="收藏优秀案例后，会显示在这里。" />}
      </div>
      <aside className="learning-dashboard-side">
        <article className="today-tasks"><header><div><span>// TODAY</span><h3>今日任务</h3></div><button onClick={() => onView("plan")}>全部任务 <ArrowRight size={14} /></button></header>{tasks.length ? <div>{tasks.map((task) => <TaskRow compact key={task.id} task={task} onToggle={onToggleTask} />)}</div> : <EmptyInline text="今天还没有学习任务" />}</article>
        <article className="recent-learning"><header><TrendUp size={19} weight="bold" /><div><span>// RECENT</span><h3>最近学习</h3></div></header>{courses.map((course) => <button key={course.id} onClick={() => onNavigate("/learning")}><span>{course.title}</span><strong>{course.progressPercent}%</strong></button>)}{!courses.length && <EmptyInline text="暂无学习记录" />}</article>
      </aside>
    </section>
  </>;
}

function CoursesView({ courses, onNavigate }) {
  return <><SectionHeader eyebrow="// MY COURSES" title="我的课程" action="发现更多课程" onAction={() => onNavigate("/learning")} />{courses.length ? <div className="my-course-grid">{courses.map((course, index) => <article key={course.id} className="my-course-card"><img src={courseImage(course, index)} alt={`${course.title}课程缩略图`} /><div><span>{course.category} · {course.creatorName}</span><h3>{course.title}</h3><p>{course.summary}</p><div className="course-progress"><i><b style={{ width: `${course.progressPercent}%` }} /></i><strong>{course.progressPercent}%</strong></div><footer><small>{course.completedLessons}/{course.lessonCount} 节课时</small><button onClick={() => onNavigate("/learning")}>继续学习 <ArrowRight size={15} /></button></footer></div></article>)}</div> : <EmptyBlock icon={BookOpenText} title="还没有加入课程" text="从资源库选择课程后，你的学习进度会显示在这里。" action="浏览课程" onAction={() => onNavigate("/learning")} />}</>;
}

function PlanView({ tasks, form, setForm, saving, onSubmit, onToggle, onDelete }) {
  const pending = tasks.filter((task) => task.status === "pending");
  const completed = tasks.filter((task) => task.status === "completed");
  return <><SectionHeader eyebrow="// LEARNING PLAN" title="学习计划" /><form className="learning-create-form" onSubmit={onSubmit}><label><span>新任务</span><input required maxLength="120" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="例如：完成一节图案生成课程" /></label><label><span>计划日期</span><input type="date" value={form.dueDate} onChange={(event) => setForm({ ...form, dueDate: event.target.value })} /></label><button disabled={saving}><Plus size={17} weight="bold" />添加任务</button></form><div className="learning-task-groups"><TaskGroup title="待完成" tasks={pending} onToggle={onToggle} onDelete={onDelete} /><TaskGroup title="已完成" tasks={completed} onToggle={onToggle} onDelete={onDelete} /></div></>;
}

function TaskGroup({ title, tasks, onToggle, onDelete }) {
  return <section className="task-group"><header><h3>{title}</h3><span>{tasks.length} 项</span></header>{tasks.length ? tasks.map((task) => <TaskRow key={task.id} task={task} onToggle={onToggle} onDelete={onDelete} />) : <EmptyInline text={`暂无${title}任务`} />}</section>;
}

function NotesView({ notes, courses, form, setForm, saving, onSubmit, onDelete }) {
  return <><SectionHeader eyebrow="// LEARNING NOTES" title="学习笔记" /><form className="note-create-form" onSubmit={onSubmit}><div><label><span>笔记标题</span><input required maxLength="120" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="记录一个值得复用的方法" /></label><label><span>关联课程</span><select value={form.courseId} onChange={(event) => setForm({ ...form, courseId: event.target.value })}><option value="">通用笔记</option>{courses.map((course) => <option key={course.id} value={course.id}>{course.title}</option>)}</select></label></div><label><span>笔记内容</span><textarea required maxLength="6000" value={form.content} onChange={(event) => setForm({ ...form, content: event.target.value })} placeholder="写下观察、方法和下一步想验证的假设……" /></label><button disabled={saving}><FileText size={17} weight="bold" />保存笔记</button></form>{notes.length ? <div className="note-grid">{notes.map((note) => <article key={note.id}><header><NotePencil size={19} weight="duotone" /><button onClick={() => onDelete(note.id)} aria-label={`删除${note.title}`}><Trash size={16} /></button></header><span>{note.courseTitle || "通用学习笔记"}</span><h3>{note.title}</h3><p>{note.content}</p><small>{formatDate(note.updatedAt)}</small></article>)}</div> : <EmptyBlock icon={NotePencil} title="还没有学习笔记" text="记录课程要点和创作反思，形成自己的方法库。" />}</>;
}

function WorksView({ title, eyebrow, items, empty, onNavigate }) {
  return <><SectionHeader eyebrow={eyebrow} title={title} action="前往案例社区" onAction={onNavigate} />{items.length ? <div className="learning-work-grid">{items.map((work, index) => <article key={work.id}><div className="learning-work-cover">{work.previewUrl ? <img src={work.previewUrl} alt={work.title} /> : <img src={FALLBACK_IMAGES[index % FALLBACK_IMAGES.length]} alt="艺术案例视觉预览" />}</div><div><span>{work.discipline}</span><h3>{work.title}</h3><p>{work.summary}</p><footer><small><Heart size={14} /> {work.likeCount} · <BookmarkSimple size={14} /> {work.favoriteCount}</small><button onClick={onNavigate}>查看案例 <ArrowRight size={14} /></button></footer></div></article>)}</div> : <EmptyBlock icon={ImageSquare} title={empty} text="前往案例社区浏览、收藏或发布你的艺术创作。" action="前往案例社区" onAction={onNavigate} />}</>;
}

function CourseRow({ course, index, onNavigate }) {
  return <article className="continue-course"><img src={courseImage(course, index)} alt={`${course.title}课程缩略图`} /><div><span>{course.category} · {course.creatorName}</span><h3>{course.title}</h3><div className="course-progress"><i><b style={{ width: `${course.progressPercent}%` }} /></i><strong>{course.progressPercent}%</strong></div><small>已完成 {course.completedLessons}/{course.lessonCount} 节 · 共 {course.estimatedMinutes} 分钟</small></div><button onClick={() => onNavigate("/learning")}>继续课程 <ArrowRight size={15} weight="bold" /></button></article>;
}

function TaskRow({ task, compact, onToggle, onDelete }) {
  return <article className={`learning-task-row ${task.status === "completed" ? "is-complete" : ""} ${compact ? "is-compact" : ""}`}><button className="task-check" onClick={() => onToggle(task)} aria-label={task.status === "completed" ? "标记为未完成" : "标记为已完成"}>{task.status === "completed" && <Check size={13} weight="bold" />}</button><div><strong>{task.title}</strong>{!compact && <span>{taskTypeName(task.taskType)} · {task.dueDate ? formatDate(task.dueDate) : "未设置日期"}</span>}</div>{!compact && <button className="task-delete" onClick={() => onDelete(task.id)} aria-label={`删除${task.title}`}><Trash size={16} /></button>}</article>;
}

function WorkMiniCard({ work, index, onClick }) {
  return <button className="learning-mini-card" onClick={onClick}><img src={work.previewUrl || FALLBACK_IMAGES[index % FALLBACK_IMAGES.length]} alt={work.title} /><span>{work.discipline}</span><strong>{work.title}</strong></button>;
}

function SectionHeader({ eyebrow, title, action, onAction }) {
  return <div className="learning-section-header"><div><span>{eyebrow}</span><h2>{title}</h2></div>{action && <button onClick={onAction}>{action} <ArrowRight size={14} /></button>}</div>;
}

function EmptyBlock({ icon: Icon, title, text, action, onAction }) {
  return <div className="learning-empty"><Icon size={35} weight="thin" /><strong>{title}</strong><p>{text}</p>{action && <button onClick={onAction}>{action} <ArrowRight size={14} /></button>}</div>;
}

function EmptyInline({ text }) { return <p className="learning-empty-inline">{text}</p>; }

function LearningLoading() {
  return <div className="learning-loading"><Clock size={28} className="spin" /><strong>正在整理你的学习空间</strong><span>课程、计划与收藏即将就绪。</span></div>;
}

function courseImage(course, index) { return COURSE_IMAGES[course.id] || FALLBACK_IMAGES[index % FALLBACK_IMAGES.length]; }
function taskTypeName(type) { return { course: "课程学习", workflow: "工作流", review: "复习", note: "学习笔记", custom: "自定义" }[type] || "学习任务"; }
function formatDate(value) { return new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric" }).format(new Date(value)); }
