import {decorateCourse} from '../coursePresentation.js';
import {courseProgress} from '../courseProgress.js';
import {atomicCardState} from './atomicParticlesModel.js';

export function atomicContentLabel(item){
 if(item.id?.startsWith('morph-handoff-'))return '知识大纲';
 return item.kind==='reflection'?'学习心得':item.kind==='course'?'原子组合课程':'教学原子';
}
// Keep different resources and their real progress separate, even when names match.
export function courseResources(legacy=[],assembled=[]){
 return [
  ...assembled.map(item=>({key:`atomic:${item.id}@${item.revision}`,type:'atomic',item,title:item.title,summary:item.summary,direction:item.direction||'跨专业',planned:false,progress:atomicCardState(item).percent,started:Boolean(item.started),label:atomicContentLabel(item)})),
  ...legacy.map(decorateCourse).map(item=>({key:`legacy:${item.id}`,type:'legacy',item,title:item.title,summary:item.summary,direction:item.category,planned:item.availability==='coming_soon',progress:courseProgress(item),started:courseProgress(item)>0,label:item.availability==='coming_soon'?'筹备课程':'试学课程'})),
 ];
}
export function filterCourseResources(resources,{availability='available',query='',direction='',stage=''}={}){
 const words=query.trim().toLocaleLowerCase();
 const scoped=resources.filter(r=>(availability==='all'||(availability==='planned'?r.planned:!r.planned))&&(!words||[r.title,r.summary,r.item.author,r.item.creatorName,r.item.authorName,r.direction,...(r.item.tools||[])].join(' ').toLocaleLowerCase().includes(words))&&(!stage||(stage==='completed'?r.progress===100:stage==='in_progress'?r.started&&r.progress<100:!r.started&&r.progress===0)));
 const facets={};for(const r of scoped)facets[r.direction]=(facets[r.direction]||0)+1;
 return {items:scoped.filter(r=>!direction||r.direction===direction),facets,total:scoped.length};
}
