import { courseProgress } from '../courseProgress.js';
import { decorateCourse } from '../coursePresentation.js';
export const SPACE_VIEWS = ['overview','portrait','courses','plan','notes','works','favorites'];
export const spaceCourseForCard = course => decorateCourse(course);
export function spaceCourseStatus(course) {
  if(course.archived || course.status === 'archived') return 'archived';
  return courseProgress(course) >= 100 ? 'complete' : courseProgress(course) > 0 ? 'progress' : 'new';
}
export function mySpaceView(view, atlas) {
  // Retired graph links remain valid, but no longer render the conflicting graph UI.
  return SPACE_VIEWS.includes(view) ? view : atlas ? 'portrait' : 'overview';
}
export const isCollectedWork = work => work?.story?.origin === 'collected';
const list = value => Array.isArray(value) ? value : [];
export function enrichFavoriteRecords(favorites, catalog) {
  const covers = new Map(list(catalog).map(work=>[work.id,work]));
  // Only enrich IDs already present in this user's private collection.
  return list(favorites).map(work=>{
    const detail=covers.get(work.id);
    return detail?{...work,previewUrl:detail.previewUrl||work.previewUrl,creators:detail.creators??work.creators,story:detail.story??work.story}:work;
  });
}
const unique = values => [...new Set(values.filter(value => typeof value === 'string' && value.trim()).map(value => value.trim()))];
export function spaceEvidence(data = {}) {
  const courses = list(data.courses), lessons = list(data.learningLessons), runs = list(data.workflowRuns);
  const completedLessons = lessons.filter(lesson => Number(lesson.progressPercent) >= 100);
  const originals = list(data.works).filter(work => !isCollectedWork(work));
  const collected = list(data.works).filter(isCollectedWork);
  return {
    courses, originals, collected,
    directions: unique(courses.map(course => course.category)),
    topics: unique(completedLessons.flatMap(lesson => [...list(lesson.knowledgePoints), lesson.title, ...list(lesson.learningSteps)])),
    completedLessons, completedRuns: runs.filter(run => run.status === 'completed'),
    // A workflow's bindings describe configured tools, not independently verified external usage.
    declaredTools: unique(runs.flatMap(run => list(run.learningBindings?.tools).map(tool => typeof tool === 'string' ? tool : tool?.name))),
    activity: [
      ...courses.filter(item=>item.lastStudiedAt).map(item=>({id:`course-${item.id}`,at:item.lastStudiedAt,label:'课程学习',title:item.title,href:`/learning?course=${encodeURIComponent(item.id)}`})),
      ...list(data.notes).map(item=>({id:`note-${item.id}`,at:item.updatedAt||item.createdAt,label:'学习笔记',title:item.title,view:'notes'})),
      ...list(data.works).map(item=>({id:`work-${item.id}`,at:item.updatedAt||item.createdAt,label:isCollectedWork(item)?'整理案例':'作品记录',title:item.title,href:`/community?work=${encodeURIComponent(item.id)}`})),
      ...runs.map(item=>({id:`run-${item.id}`,at:item.updatedAt,label:item.status==='completed'?'工作流已完成':'工作流尝试',title:item.workflowName,href:`/studio?workflow=${encodeURIComponent(item.workflowId)}&run=${encodeURIComponent(item.id)}`})),
    ].filter(item=>item.at && Number.isFinite(Date.parse(item.at))).sort((a,b)=>Date.parse(b.at)-Date.parse(a.at)),
  };
}
