// One atom counts once across courses and versions. Preserve the latest learned version as evidence.
export function portraitAtoms(rows=[]) {
 const groups=new Map();
 for(const row of rows){const prev=groups.get(row.id);if(!prev||Boolean(row.stage)>Boolean(prev.stage)||Boolean(row.stage)===Boolean(prev.stage)&&row.revision>prev.revision)groups.set(row.id,row);}
 return [...groups.values()].map(row=>({...row,history:rows.filter(item=>item.id===row.id&&item.stage).sort((a,b)=>b.revision-a.revision),title:row.payload?.title||'未命名原子',summary:row.payload?.summary||'',knowledge:row.payload?.knowledge||[],direction:row.payload?.direction||'待标注',completion:row.payload?.completion,minutes:row.payload?.minutes||0}));
}

export const portraitDirections=['设计基础','设计方法','美术史','设计史','软件实操','人工智能基础'];
const list=value=>Array.isArray(value)?value:[];
const count=value=>Number.isFinite(Number(value))?Math.max(0,Number(value)):0;
export const portraitKey=row=>`${row.id}@${row.revision}`;
export function withinPortraitRange(at,days,now=Date.now()){
 if(!days)return true;const time=Date.parse(at);return Number.isFinite(time)&&time<=now&&time>=now-days*86400000;
}
export function isVerifiedPractice(atom,evidence=[]){
 return atom.completion==='practice'&&atom.stage==='completed'&&list(evidence).some(e=>e.atomId===atom.id&&Number(e.revision)===Number(atom.revision)&&e.stage==='completed'&&e.completion==='practice'&&Boolean(e.reviewerId));
}
export function buildPortrait({rows=[],evidence=[],legacyCourses=[],source='records',route=null,days=0,now=Date.now(),mode='coverage'}={}){
 const all=portraitAtoms(list(rows));
 let scope=[],routeItems=[],routeProgress=new Map(),missing=0;
 if(source==='legacy')scope=list(legacyCourses).filter(c=>withinPortraitRange(c.lastStudiedAt,days,now));
 else if(source==='route'){
  const exact=new Map(list(rows).map(r=>[portraitKey(r),r]));
  const unique=new Set();
  for(const step of list(route?.payload?.steps)){
   const row=exact.get(`${step.atomId}@${step.revision}`);if(row)routeProgress.set(step.atomId,row.stage);
  }
  for(const step of list(route?.payload?.steps).filter(s=>s.required!==false)){
   const key=`${step.atomId}@${step.revision}`;if(unique.has(key))continue;unique.add(key);
   const row=exact.get(key);if(row)scope.push(portraitAtoms([row])[0]);else missing++;
  }
  routeItems=scope;
  // Period filters describe recent updates, never historical events we did not store.
  if(days)scope=scope.filter(a=>a.stage&&withinPortraitRange(a.updatedAt,days,now));
 }else scope=all.filter(a=>a.stage&&withinPortraitRange(a.updatedAt,days,now));
 const directions=[...new Set([...portraitDirections,...scope.map(a=>source==='legacy'?a.category||'待标注':a.direction)])];
 const axes=directions.map(direction=>{
  const items=scope.filter(x=>(source==='legacy'?x.category||'待标注':x.direction)===direction);
  const total=source==='legacy'?items.reduce((n,c)=>n+count(c.lessonCount),0):items.length;
  const completed=source==='legacy'?items.reduce((n,c)=>n+Math.min(count(c.completedLessons),count(c.lessonCount)),0):items.filter(a=>a.stage==='completed').length;
  const learned=source==='legacy'?items.filter(c=>count(c.progressPercent)>0).length:items.filter(a=>a.stage).length;
  const practices=source==='legacy'?0:items.filter(a=>a.completion==='practice').length;
  const verified=source==='legacy'?0:items.filter(a=>isVerifiedPractice(a,evidence)).length;
  const numerator=mode==='practice'?verified:completed,denominator=mode==='practice'?practices:total;
  return {direction,items,total,completed,learned,practices,verified,percent:denominator&&!missing?Math.round(numerator/denominator*100):null,numerator,denominator};
 });
 return {all,scope,axes,routeItems,routeProgress,missing,covered:axes.filter(a=>a.learned>0).length,
  learned:source==='legacy'?scope.filter(c=>count(c.progressPercent)>0).length:scope.filter(a=>a.stage).length,
  completed:axes.reduce((n,a)=>n+a.completed,0),total:axes.reduce((n,a)=>n+a.total,0),
  submitted:source==='legacy'?0:scope.filter(a=>a.stage==='submitted').length,
  verified:axes.reduce((n,a)=>n+a.verified,0),
 };
}
export function portraitRecommendation({profile,source,route,direction='',legacyCourses=[],courses=[]}){
 if(source==='legacy'){
  const available=list(legacyCourses).filter(c=>!c.archived&&c.status!=='archived'&&c.availability!=='coming_soon'&&(!direction||c.category===direction));
  const course=available.find(c=>count(c.progressPercent)>0&&count(c.progressPercent)<100)||available.find(c=>count(c.progressPercent)<100);
  if(course)return {kind:'legacy',item:course,title:'继续已有课程',reason:`保留的课程进度为 ${count(course.progressPercent)}%，可以从未完成的课时接着学习。`};
 }
 if(source==='route'&&(!route||profile.missing))return null;
 const candidates=(source==='route'?profile.routeItems:profile.all).filter(a=>!direction||a.direction===direction);
 const revised=candidates.find(a=>a.stage==='needs_revision');if(revised)return {kind:'atom',item:revised,title:'按教师反馈完善练习',reason:revised.feedback||'这份练习需要调整，先回顾反馈再修改提交。'};
 const pending=candidates.find(a=>a.stage==='submitted');
 const reading=candidates.find(a=>a.stage==='read');if(reading)return {kind:'atom',item:reading,title:reading.completion==='practice'?'把阅读转成一次练习':'继续这次原子学习',reason:reading.completion==='practice'?'已经记录阅读，接下来完成原子要求的练习，提交后由教师评价。':'已经记录阅读；回顾知识内容，形成理解后可自主确认完成。'};
 const next=candidates.find(a=>!a.stage&&(source!=='route'||list(route?.payload?.steps.find(s=>s.atomId===a.id&&s.revision===a.revision)?.prerequisites).every(id=>profile.routeProgress.get(id)==='completed')));
 if(next&&(direction||source==='route'))return {kind:'atom',item:next,title:'探索下一步知识',reason:source==='route'?'按所选路线的原子顺序继续；这里展示的是阅读或练习入口，不代表已掌握。':'这个方向还有未开始的学习内容，可以先从一个原子开始。'};
 if(pending)return {kind:'atom',item:pending,title:'查看已提交的练习',reason:'练习已经提交，等待教师评价。可以查看提交记录，无需重复提交。',waiting:true};
 const course=list(courses)[0];if(course)return {kind:'course',item:course,title:'选择一条完整学习路线',reason:'从已发布的课程开始，逐个认识组成它的知识原子。'};
 if(next)return {kind:'atom',item:next,title:'从一个知识点开始',reason:'先阅读原子内容，再留下自己的理解和实践记录。'};
 return null;
}
