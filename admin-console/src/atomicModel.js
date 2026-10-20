export const atomicStatus={draft:'草稿',pending_review:'审核中',published:'已发布',rejected:'待修改'};
export const atomicKinds={teaching:'教师教学',reflection:'学习心得',course:'完整课程'};
export function atomicAuthoringActions(roles=[],view){return {canTeach:roles.some(role=>['teacher','admin'].includes(role)),canReflect:['learning','mine'].includes(view)};}
export const canReviewAtomic=roles=>roles.some(role=>['teacher','admin','operator'].includes(role));
export const atomicSourceTitle=(parentId,detail)=>parentId&&parentId===detail?.id?(detail.payload?.title??''):'';
export const learningStage={read:'已阅读',submitted:'待教师评价',completed:'已完成',needs_revision:'需要修改'};
export function atomicStepLabel(step){return !step.available?'暂不可用':step.stage==='completed'&&step.task&&step.taskProgress?.stage!=='completed'?'原子已学，课程任务待完成':learningStage[step.stage]||'未开始';}
export function atomicCourseProgress(steps=[]){const required=steps.filter(s=>s.required);const completed=required.filter(s=>s.available&&s.stage==='completed'&&(!s.task||s.taskProgress?.stage==='completed')).length;return {completed,total:required.length,percent:required.length?Math.round(completed/required.length*100):0,next:steps.find(s=>s.available&&(s.stage!=='completed'||(s.task&&s.taskProgress?.stage!=='completed')))??null};}
export function moveAtomicStep(steps,index,direction){const target=index+direction;if(target<0||target>=steps.length)return steps;const next=[...steps];[next[index],next[target]]=[next[target],next[index]];return next;}
export const atomicUrl=(id,revision,library='atoms')=>`/learning?library=${library}&node=${encodeURIComponent(id)}${revision?'&revision='+revision:''}`;
