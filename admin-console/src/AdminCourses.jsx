import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, BookOpenText, Check, Clock, Plus, X } from "@phosphor-icons/react";
import {
  createAdminCourse, decideCourseReview, getAdminCourse, getAdminCourses, getCourseReviews,
  submitCourseReview, updateAdminCourse, updateCourseResource, uploadCourseResource,
} from "./services/adminApi.js";

const statusNames = { draft: "草稿", pending_review: "待审核", published: "已发布", rejected: "已驳回", archived: "已归档" };
const editable = (course) => ["draft", "rejected"].includes(course.status);
const emptyLesson = () => ({ title: "", summary: "", lessonType: "lesson", estimatedMinutes: 30, workflowId: "", modelConfigIds: [] });
const splitTags = (value) => value.split(/[,，]/).map((tag) => tag.trim()).filter(Boolean);

export function AdminCourses({ showToast }) {
  const [courses, setCourses] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [courseEditor, setCourseEditor] = useState(null);
  const [resourceCourse, setResourceCourse] = useState(null);
  const [resourceEditor, setResourceEditor] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const [courseResult, reviewResult] = await Promise.allSettled([getAdminCourses(), getCourseReviews()]);
    if (courseResult.status === "fulfilled") setCourses(courseResult.value.items ?? []);
    if (reviewResult.status === "fulfilled") setReviews(reviewResult.value.items ?? []);
  };
  useEffect(() => { void load(); }, []);
  const run = async (work, success) => {
    setBusy(true);
    try { await work(); await load(); showToast(success); }
    catch (error) { showToast(error.message); }
    finally { setBusy(false); }
  };
  const openCourse = async (course, target) => {
    setBusy(true);
    try {
      const detail = await getAdminCourse(course.id);
      if (target === "course") setCourseEditor(detail);
      else setResourceCourse(detail);
    } catch (error) { showToast(error.message); }
    finally { setBusy(false); }
  };

  return <div className="page-content">
    <section className="page-intro"><div><p>// COURSE OPERATIONS</p><h1>课程资源管理</h1><span>创建课程、配置课时与资料，提交发布审核</span></div><button className="primary-button" onClick={() => setCourseEditor({ new: true, lessons: [emptyLesson()] })}><Plus size={18} weight="bold" /> 新建课程</button></section>
    <section className="course-admin-grid">
      <article className="table-panel course-admin-list">
        <div className="panel__heading course-admin-heading"><div><p>// COURSE LIBRARY</p><h2>课程列表</h2></div><span>{courses.length} 门课程</span></div>
        {courses.map((course) => <div className="course-admin-row" key={course.id}>
          <div className="course-admin-icon"><BookOpenText size={22} weight="bold" /></div>
          <div><span>{course.category} · {course.lessonCount} 个课时 · {course.estimatedMinutes} 分钟</span><strong>{course.title}</strong><small>{course.creatorName || "平台课程"} · 版本 {course.versionNumber}</small></div>
          <em className={`course-state course-state--${course.status}`}>{statusNames[course.status] ?? course.status}</em>
          <div className="course-admin-actions">
            <button disabled={busy || !editable(course)} onClick={() => openCourse(course, "course")}>编辑课程</button>
            <button disabled={busy} onClick={() => openCourse(course, "resources")}>管理资料</button>
            <button disabled={busy || !editable(course)} onClick={() => run(() => submitCourseReview(course.id), "课程已提交发布审核")}>提交审核 <ArrowRight size={15} weight="bold" /></button>
          </div>
        </div>)}
        {!courses.length && <div className="empty-state"><BookOpenText size={34} /><strong>尚无课程</strong><span>点击“新建课程”建立第一门正式课程。</span></div>}
      </article>
      <article className="table-panel course-review-list">
        <div className="panel__heading course-admin-heading"><div><p>// PUBLISH REVIEW</p><h2>课程发布审核</h2></div><span>{reviews.filter((item) => item.status === "pending").length} 项待处理</span></div>
        {reviews.slice(0, 8).map((review) => <div className="course-review-row" key={review.id}>
          <div><span><Clock size={13} /> {new Date(review.submittedAt).toLocaleString("zh-CN")}</span><strong>{review.courseTitle}</strong><small>{review.submitterName} · 版本 {review.snapshotVersion}</small></div>
          {review.status === "pending" ? <div><button disabled={busy} onClick={() => run(() => decideCourseReview(review.id, { status: "rejected", note: "请补充课时说明后重新提交" }), "课程审核已驳回")}>驳回</button><button disabled={busy} className="approve" onClick={() => run(() => decideCourseReview(review.id, { status: "approved", note: "审核通过" }), "课程已审核发布")}><Check size={15} /> 发布</button></div> : <em className={`course-state course-state--${review.status === "approved" ? "published" : "rejected"}`}>{review.status === "approved" ? "已通过" : "已驳回"}</em>}
        </div>)}
        {!reviews.length && <div className="empty-state"><Check size={34} /><strong>暂无审核记录</strong><span>课程提交后会出现在这里。</span></div>}
      </article>
    </section>
    {courseEditor && <CourseEditor key={courseEditor.id ?? "new"} course={courseEditor} busy={busy} onClose={() => setCourseEditor(null)} onSave={(input) => run(async () => {
      if (courseEditor.new) await createAdminCourse(input);
      else await updateAdminCourse(courseEditor.id, input);
      setCourseEditor(null);
    }, courseEditor.new ? "课程草稿已创建" : "课程草稿已更新")} />}
    {resourceCourse && <ResourceManager course={resourceCourse} busy={busy} onClose={() => setResourceCourse(null)} onAdd={() => setResourceEditor({ new: true })} onEdit={setResourceEditor} />}
    {resourceCourse && resourceEditor && <ResourceEditor key={resourceEditor.id ?? "new"} course={resourceCourse} resource={resourceEditor} busy={busy} onClose={() => setResourceEditor(null)} onSave={(file, metadata) => run(async () => {
      if (resourceEditor.new) await uploadCourseResource(resourceCourse.id, file, metadata);
      else await updateCourseResource(resourceCourse.id, resourceEditor.id, metadata);
      setResourceCourse(await getAdminCourse(resourceCourse.id));
      setResourceEditor(null);
    }, resourceEditor.new ? "课程资料已上传" : "资料信息已更新")} />}
  </div>;
}

function Modal({ title, subtitle, onClose, children, className = "" }) {
  return createPortal(<div className="course-modal-layer"><button className="drawer-scrim" aria-label="关闭" onClick={onClose} /><section className={`course-modal ${className}`} role="dialog" aria-modal="true" aria-label={title}>
    <header><div><p>{subtitle}</p><h2>{title}</h2></div><button type="button" aria-label="关闭窗口" onClick={onClose}><X size={20} /></button></header>
    {children}
  </section></div>, document.body);
}

function CourseEditor({ course, busy, onClose, onSave }) {
  const [form, setForm] = useState({
    title: course.title ?? "", summary: course.summary ?? "", category: course.category ?? "",
    difficulty: course.difficulty ?? "beginner", coverUrl: course.coverUrl ?? "",
    coverAssetKey: course.coverAssetKey ?? "", isFeatured: course.isFeatured ?? false,
    lessons: course.lessons?.length ? course.lessons : [emptyLesson()],
  });
  const set = (field, value) => setForm((current) => ({ ...current, [field]: value }));
  const setLesson = (index, field, value) => setForm((current) => ({ ...current, lessons: current.lessons.map((lesson, position) => position === index ? { ...lesson, [field]: value } : lesson) }));
  const totalMinutes = form.lessons.reduce((sum, lesson) => sum + (Number(lesson.estimatedMinutes) || 0), 0);
  const save = (event) => {
    event.preventDefault();
    onSave({ title: form.title.trim(), summary: form.summary.trim(), category: form.category.trim(), difficulty: form.difficulty,
      coverUrl: form.coverUrl.trim() || null, coverAssetKey: form.coverAssetKey.trim() || null, isFeatured: form.isFeatured,
      lessons: form.lessons.map((lesson) => ({ ...lesson, title: lesson.title.trim(), summary: lesson.summary.trim(),
        estimatedMinutes: Number(lesson.estimatedMinutes), workflowId: lesson.workflowId?.trim() || null,
        modelConfigIds: typeof lesson.modelConfigIds === "string" ? splitTags(lesson.modelConfigIds) : lesson.modelConfigIds ?? [] })) });
  };
  return <Modal title={course.new ? "新建课程草稿" : "编辑课程草稿"} subtitle="// COURSE DETAILS" onClose={onClose} className="course-modal--wide">
    <form onSubmit={save}>
      <div className="course-form-grid">
        <label>课程名称<input required minLength="2" maxLength="120" value={form.title} onChange={(event) => set("title", event.target.value)} /></label>
        <label>学科分类<input required maxLength="40" value={form.category} onChange={(event) => set("category", event.target.value)} /></label>
        <label className="course-form-full">课程简介<textarea maxLength="2000" value={form.summary} onChange={(event) => set("summary", event.target.value)} /></label>
        <label>难度<select value={form.difficulty} onChange={(event) => set("difficulty", event.target.value)}><option value="beginner">入门</option><option value="intermediate">进阶</option><option value="advanced">高级</option></select></label>
        <label>封面图片链接（HTTPS）<input type="url" pattern="https://.*" maxLength="2000" value={form.coverUrl} onChange={(event) => set("coverUrl", event.target.value)} placeholder="https://example.com/cover.jpg" /></label>
        <label>封面资源键（可选）<input maxLength="500" value={form.coverAssetKey} onChange={(event) => set("coverAssetKey", event.target.value)} placeholder="对象存储中的相对路径" /></label>
        <label className="course-check"><input type="checkbox" checked={form.isFeatured} onChange={(event) => set("isFeatured", event.target.checked)} /> 设为推荐课程</label>
      </div>
      <div className="course-lessons-heading"><div><h3>课时设置</h3><p>总预计时长：{totalMinutes} 分钟</p></div><button type="button" onClick={() => set("lessons", [...form.lessons, emptyLesson()])} disabled={form.lessons.length >= 100}><Plus size={15} /> 添加课时</button></div>
      {form.lessons.map((lesson, index) => <fieldset className="course-lesson-editor" key={lesson.id ?? index}><legend>第 {index + 1} 课时</legend>
        <div className="course-form-grid">
          <label>课时名称<input required maxLength="120" value={lesson.title} onChange={(event) => setLesson(index, "title", event.target.value)} /></label>
          <label>类型<select value={lesson.lessonType} onChange={(event) => setLesson(index, "lessonType", event.target.value)}><option value="lesson">课程</option><option value="practice">练习</option><option value="assignment">作业</option><option value="workflow">工作流</option></select></label>
          <label className="course-form-full">课时说明<textarea maxLength="1000" value={lesson.summary ?? ""} onChange={(event) => setLesson(index, "summary", event.target.value)} /></label>
          <label>预计时长（分钟）<input type="number" min="0" max="1440" required value={lesson.estimatedMinutes} onChange={(event) => setLesson(index, "estimatedMinutes", event.target.value)} /></label>
          <label>关联工作流 ID（可选）<input maxLength="100" value={lesson.workflowId ?? ""} onChange={(event) => setLesson(index, "workflowId", event.target.value)} /></label>
          <label className="course-form-full">模型配置 ID（逗号分隔，可选）<input value={Array.isArray(lesson.modelConfigIds) ? lesson.modelConfigIds.join(", ") : lesson.modelConfigIds ?? ""} onChange={(event) => setLesson(index, "modelConfigIds", event.target.value)} /></label>
        </div>
        <button type="button" className="course-remove" disabled={form.lessons.length <= 1} onClick={() => set("lessons", form.lessons.filter((_, position) => position !== index))}>移除此课时</button>
      </fieldset>)}
      <footer><button type="button" className="outline-button" onClick={onClose}>取消</button><button disabled={busy} className="primary-button" type="submit">保存课程草稿 <ArrowRight size={16} /></button></footer>
    </form>
  </Modal>;
}

function ResourceManager({ course, busy, onClose, onAdd, onEdit }) {
  return <Modal title={`${course.title} · 课程资料`} subtitle="// COURSE MATERIALS" onClose={onClose} className="course-modal--wide">
    <div className="course-manager-heading"><span>{course.resources.length} / 30 个资料</span><button className="primary-button" disabled={busy || !editable(course) || course.resources.length >= 30} onClick={onAdd}><Plus size={15} /> 上传资料</button></div>
    {course.resources.length ? <div className="course-resource-list">{course.resources.map((resource) => <article key={resource.id}>
      {resource.coverUrl && <img src={resource.coverUrl} alt="" />}
      <div><strong>{resource.title}</strong><p>{resource.summary || resource.fileName}</p><small>{resource.tags?.join(" · ") || "无标签"} · {course.lessons.find((lesson) => lesson.id === resource.lessonId)?.title ?? "未关联课时"}</small></div>
      <button disabled={busy || !editable(course)} onClick={() => onEdit(resource)}>编辑</button>
    </article>)}</div> : <p className="course-modal-empty">暂无资料，可上传 PDF、DOCX、PPTX、MP4 或 WebM。</p>}
  </Modal>;
}

function ResourceEditor({ course, resource, busy, onClose, onSave }) {
  const [file, setFile] = useState(null);
  const [form, setForm] = useState({ title: resource.title ?? "", summary: resource.summary ?? "", tags: resource.tags?.join(", ") ?? "", coverUrl: resource.coverUrl ?? "", lessonId: resource.lessonId ?? "" });
  const set = (field, value) => setForm((current) => ({ ...current, [field]: value }));
  const save = (event) => {
    event.preventDefault();
    if (resource.new && !file) return;
    onSave(file, { title: form.title.trim(), summary: form.summary.trim(), tags: splitTags(form.tags),
      coverUrl: form.coverUrl.trim() || null, lessonId: form.lessonId || null });
  };
  return <Modal title={resource.new ? "上传课程资料" : "编辑资料信息"} subtitle="// RESOURCE DETAILS" onClose={onClose} className="course-modal--wide course-modal--nested">
    <form onSubmit={save}>
      {resource.new && <label>资料文件（最多 10 MiB）<input type="file" required accept=".pdf,.docx,.pptx,.mp4,.webm" onChange={(event) => { const selected = event.target.files?.[0] ?? null; setFile(selected); if (selected && !form.title) set("title", selected.name); }} /></label>}
      <div className="course-form-grid">
        <label>资料标题<input required maxLength="200" value={form.title} onChange={(event) => set("title", event.target.value)} /></label>
        <label>所属课时<select value={form.lessonId} onChange={(event) => set("lessonId", event.target.value)}><option value="">不关联课时</option>{course.lessons.map((lesson) => <option key={lesson.id} value={lesson.id}>{lesson.title}</option>)}</select></label>
        <label className="course-form-full">资料简介<textarea maxLength="2000" value={form.summary} onChange={(event) => set("summary", event.target.value)} /></label>
        <label>标签（逗号分隔，最多 20 个）<input value={form.tags} onChange={(event) => set("tags", event.target.value)} /></label>
        <label>封面图片链接（HTTPS）<input type="url" pattern="https://.*" maxLength="2000" value={form.coverUrl} onChange={(event) => set("coverUrl", event.target.value)} /></label>
      </div>
      <footer><button type="button" className="outline-button" onClick={onClose}>取消</button><button disabled={busy || (resource.new && !file)} className="primary-button" type="submit">{resource.new ? "上传资料" : "保存资料信息"} <ArrowRight size={16} /></button></footer>
    </form>
  </Modal>;
}
