import { useEffect, useState } from "react";
import { ArrowRight, BookOpenText, Check, Clock, Plus, X } from "@phosphor-icons/react";
import {
  createAdminCourse,
  decideCourseReview,
  getAdminCourses,
  getCourseReviews,
  submitCourseReview,
  uploadCourseResource,
} from "./services/adminApi.js";

const statusNames = {
  draft: "草稿",
  pending_review: "待审核",
  published: "已发布",
  rejected: "已驳回",
  archived: "已归档",
};

export function AdminCourses({ showToast }) {
  const [courses, setCourses] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const [courseResult, reviewResult] = await Promise.allSettled([getAdminCourses(), getCourseReviews()]);
    if (courseResult.status === "fulfilled") setCourses(courseResult.value.items);
    if (reviewResult.status === "fulfilled") setReviews(reviewResult.value.items);
  };

  useEffect(() => { load(); }, []);

  const run = async (work, success) => {
    setBusy(true);
    try { await work(); await load(); showToast(success); }
    catch (error) { showToast(error.message); }
    finally { setBusy(false); }
  };

  return <div className="page-content">
    <section className="page-intro"><div><p>// COURSE OPERATIONS</p><h1>课程资源管理</h1><span>创建课程、配置课时，提交发布审核并跟踪上线状态</span></div><button className="primary-button" onClick={() => setCreating(true)}><Plus size={18} weight="bold" /> 新建课程</button></section>
    <section className="course-admin-grid">
      <article className="table-panel course-admin-list">
        <div className="panel__heading course-admin-heading"><div><p>// COURSE LIBRARY</p><h2>课程列表</h2></div><span>{courses.length} 门课程</span></div>
        {courses.map((course) => <div className="course-admin-row" key={course.id}>
          <div className="course-admin-icon"><BookOpenText size={22} weight="bold" /></div>
          <div><span>{course.category} · {course.lessonCount} 个课时</span><strong>{course.title}</strong><small>{course.creatorName || "平台课程"} · 版本 {course.versionNumber}</small></div>
          <em className={`course-state course-state--${course.status}`}>{statusNames[course.status] ?? course.status}</em>
          <label className="course-resource-upload"><input disabled={busy || !["draft", "rejected"].includes(course.status)} type="file" accept="application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation,.pdf,.docx,.pptx" onChange={(event) => { const file = event.target.files?.[0]; if (file) run(() => uploadCourseResource(course.id, file), "课程资料已安全上传"); event.target.value = ""; }} /><span>上传资料</span></label>
          <button disabled={busy || !["draft", "rejected"].includes(course.status)} onClick={() => run(() => submitCourseReview(course.id), "课程已提交发布审核")}>提交审核 <ArrowRight size={15} weight="bold" /></button>
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
    {creating && <CreateCourseModal busy={busy} onClose={() => setCreating(false)} onCreate={(input) => run(async () => { await createAdminCourse(input); setCreating(false); }, "课程草稿已创建")} />}
  </div>;
}

function CreateCourseModal({ busy, onClose, onCreate }) {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("视觉传达");
  const [lessonTitle, setLessonTitle] = useState("");
  return <div className="course-modal-layer"><button className="drawer-scrim" aria-label="关闭" onClick={onClose} /><form className="course-modal" onSubmit={(event) => { event.preventDefault(); onCreate({ title, category, summary: "从课程资源管理端创建的课程。", difficulty: "beginner", lessons: [{ title: lessonTitle, summary: "课程第一课时", lessonType: "lesson", estimatedMinutes: 30, modelConfigIds: [] }] }); }}>
    <header><div><p>// NEW COURSE</p><h2>新建课程草稿</h2></div><button type="button" onClick={onClose}><X size={20} /></button></header>
    <label>课程名称<input required minLength="2" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="例如：AI 辅助视觉创作基础" /></label>
    <label>学科分类<input required value={category} onChange={(event) => setCategory(event.target.value)} /></label>
    <label>第一课时<input required value={lessonTitle} onChange={(event) => setLessonTitle(event.target.value)} placeholder="例如：认识生成式设计工作流" /></label>
    <footer><button type="button" className="outline-button" onClick={onClose}>取消</button><button disabled={busy} className="primary-button" type="submit">保存课程草稿 <ArrowRight size={16} /></button></footer>
  </form></div>;
}
