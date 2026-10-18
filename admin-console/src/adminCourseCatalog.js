export const ADMIN_COURSE_FILTERS=[['all','全部状态'],['trial','开放试学'],['coming_soon','目录筹备中'],['draft','草稿'],['pending_review','待审核'],['published','已发布'],['rejected','已驳回'],['archived','历史归档']];
export function filterAdminCourses(courses,{query='',status='all',category='all'}={}) {
  const terms=query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return courses.filter(course=>{
    const text=[course.title,course.id,course.creatorName,course.catalog?.authorLabel,course.category,course.catalog?.code].filter(Boolean).join(' ').toLocaleLowerCase();
    const stateMatches=status==='all'||(['trial','coming_soon'].includes(status)?course.status==='published'&&course.availability===status:course.status===status);
    return stateMatches&&(category==='all'||course.category===category)&&terms.every(term=>text.includes(term));
  }).sort((left,right)=>Number(left.status==='archived')-Number(right.status==='archived'));
}
