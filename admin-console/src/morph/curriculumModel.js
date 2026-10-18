// The handoff's directions and editorial paths, resolved against the live catalog.
// Recommendations never enrol a learner or invent progress / course availability.
import { courseProgress } from '../courseProgress.js';
export const courseDirections = ['全部','设计基础','设计方法','美术史','设计史','软件实操','人工智能基础'];
export function courseCardState(course) {
  const progress=courseProgress(course);
  if(course.archived||course.status==='archived') return {label:'已下架',tone:'new',action:'发现新课程'};
  if(course.availability==='coming_soon') return {label:'筹备中',tone:'new',action:'查看规划'};
  return progress>=100 ? {label:'已完成',tone:'done',action:'回顾课程'} : progress>0 ? {label:'进行中',tone:'',action:'继续学习'} : {label:'未开始',tone:'new',action:'开始学习'};
}
const paths = [
  {title:'信息图表设计',pattern:/信息|图表|数据/,codes:['DTH-10','COL-01','TYP-02','GRD-03','INF-13'],reasons:['明确受众与要回答的问题','建立数据类别与视觉编码','保证标签、数字与注释可读','组织图表和信息层级','综合数据、图表与视觉叙事']},
  {title:'海报设计',pattern:/海报|视觉传达|平面/,codes:['DTH-10','COL-01','TYP-02','GRD-03','POS-11'],reasons:['找到传播目标与核心概念','确定情绪与配色','建立文字的表现与阅读层级','形成版面秩序与视觉节奏','把方法应用到完整海报']},
  {title:'产品设计',pattern:/产品|工业|材质/,codes:['DTH-10','CMF-05','PAR-09','PRD-12'],reasons:['理解使用情境与用户需求','选择材料与表面表达','探索参数化形态','完成形态、材质与原型验证']},
];
export const curriculumTopics=paths.map(path=>path.title);
export function curriculumAvailability(result) {
  const available=(result?.steps??[]).map(step=>step.course).filter(course=>course.availability!=='coming_soon'&&!course.archived&&course.status!=='archived');
  const nextCourse=available.find(course=>courseProgress(course)<100)??available[0]??null;
  return { availableCount:available.length, plannedCount:(result?.steps.length??0)-available.length, nextCourse, review:Boolean(nextCourse&&courseProgress(nextCourse)>=100) };
}
export function composeCurriculum(text,catalog=[]) {
  const config=paths.find(path=>path.pattern.test(String(text).trim()));
  if(!config)return null;
  const available=catalog.filter(course=>!course.archived&&course.status!=='archived');
  const steps=config.codes.flatMap((code,index)=>{
    const course=available.find(item=>item.catalog?.code===code);
    return course ? [{course,reason:config.reasons[index]}] : [];
  });
  return {title:config.title,steps,missing:config.codes.filter(code=>!steps.some(step=>step.course.catalog?.code===code)),duration:steps.reduce((sum,{course})=>sum+Math.max(0,Number(course.estimatedMinutes)||0),0)};
}
