import {atomicStatus,learningStage} from '../atomicModel.js';
import handoffCovers from './handoffAtomicCovers.json' with {type:'json'};

export const atomicDirections=['设计基础','设计方法','美术史','设计史','软件实操','人工智能基础'];
export const atomicNetworkKey=item=>`${item.id}@${item.revision}`;
export function atomicCardState(item){
 const course=item.kind==='course',required=Number(item.required??1),completed=Number(item.completed??(item.stage==='completed'?1:0));
 const percent=required>0?Math.round(completed/required*100):0;
 const done=percent===100,started=Boolean(item.started||item.stage);
 return {percent,label:item.status!=='published'?atomicStatus[item.status]||'草稿':done?'已完成':item.stage?learningStage[item.stage]:started?'学习中':'未开始',action:item.status!=='published'?'查看投稿':done?'回顾课程':started?'继续学习':course?'开始课程':'开始学习',tone:done?'complete':started?'learning':'new'};
}
export function atomicCover(item){
 if(handoffCovers[item.id])return handoffCovers[item.id];
 const assets='/morph-course-network/';
 return assets+({color:'cards-img6.svg',type:'cards-img8.svg',grid:'cards-img9.svg'}[item.visual]|| (item.kind==='course'?'cards-imgTokens.svg':item.kind==='reflection'?'cards-img4.svg':'cards-img.svg'));
}
// Edges express stored relationships only: course membership, explicit prerequisites,
// and reviewed reflections. Similar-looking titles never imply a learning dependency.
export function atomicNetworkGraph(items=[],courseKey=''){
 const all=new Map(items.map(item=>[atomicNetworkKey(item),item]));
 const courses=items.filter(item=>item.kind==='course');
 const chosen=courseKey?courses.filter(item=>atomicNetworkKey(item)===courseKey):courses;
 const wanted=new Set();const edges=[];
 for(const course of chosen){
  const source=atomicNetworkKey(course);wanted.add(source);
  const steps=course.steps||[];
  for(const step of steps){
   const target=atomicNetworkKey({id:step.atomId,revision:step.revision});
   if(!all.has(target))continue;wanted.add(target);
   edges.push({id:`${source}:contains:${target}`,source,target,type:'default',data:{kind:'contains'},style:{stroke:'#8174d6',strokeWidth:1.6}});
   for(const id of step.prerequisites||[]){
    const prerequisite=steps.find(s=>s.atomId===id);if(!prerequisite)continue;
    const from=atomicNetworkKey({id,revision:prerequisite.revision});if(!all.has(from))continue;
    edges.push({id:`${source}:${from}:pre:${target}`,source:from,target,type:'default',data:{kind:'prerequisite'},style:{stroke:'#a195c6',strokeWidth:1,strokeDasharray:'4 4'}});
   }
  }
 }
 for(const item of items.filter(item=>item.kind==='reflection')){
  const parent=items.find(p=>p.id===item.parentId&&p.revision===p.publishedRevision);
  if(!parent||courseKey&&!wanted.has(atomicNetworkKey(parent)))continue;
  const source=atomicNetworkKey(parent),target=atomicNetworkKey(item);wanted.add(source);wanted.add(target);
  edges.push({id:`${source}:reflection:${target}`,source,target,type:'default',data:{kind:'reflection'},style:{stroke:'#a75ec0',strokeWidth:1.5}});
 }
 const shown=courseKey?items.filter(item=>wanted.has(atomicNetworkKey(item))):items;
 const columns=[shown.filter(i=>i.kind==='course'),shown.filter(i=>i.kind==='teaching'),shown.filter(i=>i.kind==='reflection')];
 const nodes=[];
 columns.forEach((column,x)=>column.forEach((item,index)=>{
  // Split large atom collections into columns to preserve legibility when fitting.
  const sub=x===1?Math.floor(index/3):0,row=x===1?index%3:index;
  nodes.push({id:atomicNetworkKey(item),type:'atomicParticle',position:{x:x===0?20:x===1?290+sub*240:310+Math.ceil(columns[1].length/3)*240,y:row*115+(x===0?120:20)},data:{...item,shared:edges.filter(e=>e.data.kind==='contains'&&e.target===atomicNetworkKey(item)).length}});
 }));
 const nodeIds=new Set(nodes.map(n=>n.id));
 return {nodes,edges:edges.filter(e=>nodeIds.has(e.source)&&nodeIds.has(e.target)),courses};
}
