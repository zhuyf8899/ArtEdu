import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, BookOpenText, CheckCircle, Clock, PlayCircle } from "@phosphor-icons/react";
import { enrollCourse, getCourse, getCourses, updateLessonProgress } from "./services/adminApi.js";

export function LearningLibrary({ fallbackCourses, onNotice }) {
  const [courses, setCourses] = useState(fallbackCourses);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getCourses().then((payload) => setCourses(payload.items?.length ? payload.items : fallbackCourses)).catch(() => {});
  }, [fallbackCourses]);

  const openCourse = async (courseId) => {
    setLoading(true);
    try { setSelected(await getCourse(courseId)); }
    catch (error) { onNotice(error.message); }
    finally { setLoading(false); }
  };

  const enroll = async () => {
    setLoading(true);
    try { setSelected(await enrollCourse(selected.id)); onNotice("课程已加入“我的学习”"); }
    catch (error) { onNotice(error.message); }
    finally { setLoading(false); }
  };

  const completeLesson = async (lessonId) => {
    setLoading(true);
    try { setSelected(await updateLessonProgress(selected.id, lessonId, 100)); onNotice("课时已完成，学习进度已保存"); }
    catch (error) { onNotice(error.message); }
    finally { setLoading(false); }
  };

  if (selected) return <section className="learning-detail">
    <button className="learning-back" onClick={() => setSelected(null)}><ArrowLeft size={16} weight="bold" /> 返回课程库</button>
    <div className="learning-detail__hero"><div><span>{selected.category} · {difficultyName(selected.difficulty)}</span><h2>{selected.title}</h2><p>{selected.summary}</p><div><Clock size={16} /> {selected.estimatedMinutes} 分钟 · {selected.lessonCount} 个课时</div></div><aside><strong>{selected.progressPercent}%</strong><span>学习进度</span><i><b style={{ width: `${selected.progressPercent}%` }} /></i>{selected.enrollmentStatus ? <em>已加入学习</em> : <button disabled={loading} onClick={enroll}><PlayCircle size={18} weight="fill" /> 加入课程</button>}</aside></div>
    <div className="lesson-list">{selected.lessons.map((lesson, index) => <article key={lesson.id}><span>{String(index + 1).padStart(2, "0")}</span><div><small>{lesson.lessonType === "workflow" ? "AI 工作流实践" : "课程课时"}</small><strong>{lesson.title}</strong><p>{lesson.summary}</p></div><div><em>{lesson.estimatedMinutes} 分钟</em>{lesson.progressPercent >= 100 ? <b><CheckCircle size={17} weight="fill" /> 已完成</b> : <button disabled={loading} onClick={() => completeLesson(lesson.id)}>标记完成 <ArrowRight size={15} /></button>}</div></article>)}</div>
  </section>;

  return <section className="course-grid">{courses.map((course, index) => <article className="course-card" key={course.id}><div className={`course-cover course-cover--${index % 3}`}><BookOpenText size={32} weight="thin" /><span>{course.category}</span></div><div className="course-card__content"><small>{course.lessonCount ?? 0} 个课时 · {difficultyName(course.difficulty)}</small><h3>{course.title}</h3><p>{course.summary}</p><div className="course-card__footer"><div><i><b style={{ width: `${course.progressPercent ?? 0}%` }} /></i><span>{course.progressPercent ?? 0}%</span></div><button disabled={loading} onClick={() => openCourse(course.id)} aria-label={`打开${course.title}`}><ArrowRight size={18} weight="bold" /></button></div></div></article>)}</section>;
}

function difficultyName(value) {
  return { beginner: "入门", intermediate: "进阶", advanced: "高级" }[value] ?? "入门";
}
