import { z } from 'zod';
import { parseInput } from '../../common/validation';
// Preserve Zod output types (defaults are present after parsing).
export function parseAtomic<S extends z.ZodTypeAny>(schema:S,input:unknown):z.output<S>{return parseInput(schema,input) as z.output<S>;}
const text=(max:number)=>z.string().trim().max(max);
const id=z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/);
const step=z.object({atomId:id,revision:z.number().int().positive(),context:text(1000).default(''),task:text(2000).default(''),required:z.boolean().default(true),prerequisites:z.array(id).max(50).default([])}).strict();
const common={title:text(120).min(2),summary:text(1000).min(5)};
export const atomPayload=z.object({...common,visual:z.enum(['color','type','grid']).optional(),direction:z.enum(['设计基础','设计方法','美术史','设计史','软件实操','人工智能基础']).optional(),objective:text(2000).min(5),content:text(50000).min(10),minutes:z.number().int().min(1).max(480),knowledge:z.array(text(80).min(1)).max(20),tools:z.array(text(80).min(1)).max(20).default([]),completion:z.enum(['read','practice']),exercise:text(4000).default(''),source:text(2000).default(''),assetIds:z.array(id).max(12).default([])}).strict().superRefine((v,c)=>{if(v.completion==='practice'&&v.exercise.length<5)c.addIssue({code:'custom',path:['exercise'],message:'练习原子需要明确任务'});});
export const coursePayload=z.object({...common,steps:z.array(step).min(1).max(50)}).strict().superRefine((v,c)=>{
 const seen=new Set<string>();for(const [index,s]of v.steps.entries()){
  if(seen.has(s.atomId))c.addIssue({code:'custom',path:['steps',index],message:'同一课程不能重复引用相同原子'});
  if(new Set(s.prerequisites).size!==s.prerequisites.length||s.prerequisites.some(p=>!seen.has(p)))c.addIssue({code:'custom',path:['steps',index],message:'先修原子必须在前面，不能循环或指向课程外'});
  seen.add(s.atomId);
 }
 if(!v.steps.some(s=>s.required))c.addIssue({code:'custom',path:['steps'],message:'至少保留一个必修原子'});
});
export const createAtomicSchema=z.object({kind:z.enum(['teaching','reflection','course']),parentId:id.optional(),payload:z.unknown()}).strict();
export const saveAtomicSchema=z.object({expectedRevision:z.number().int().positive(),payload:z.unknown()}).strict();
export const atomicRevisionSchema=z.object({revision:z.number().int().positive()}).strict();
export const atomicDecisionSchema=atomicRevisionSchema.extend({decision:z.enum(['publish','reject']),note:text(2000).min(2)}).strict();
export const atomicProgressSchema=atomicRevisionSchema.extend({action:z.enum(['read','complete','submit']),submission:text(10000).default('')}).strict();
export const atomicTaskSchema=atomicRevisionSchema.extend({atomId:id,submission:text(10000).min(10)}).strict();
export const atomicGradeSchema=atomicRevisionSchema.extend({userId:id,atomId:id.optional(),expectedSubmissionVersion:z.number().int().positive(),decision:z.enum(['pass','revise']),note:text(2000).min(2)}).strict();
export const atomicListSchema=z.object({view:z.enum(['atoms','courses','learning','mine','review']).default('atoms'),query:text(100).default(''),page:z.coerce.number().int().min(1).max(10000).default(1)}).strict();
export const atomicDetailSchema=z.object({revision:z.coerce.number().int().positive().optional()}).strict();
export type AtomPayload=z.infer<typeof atomPayload>;
export type CoursePayload=z.infer<typeof coursePayload>;

export const atomicKnowledgeSchema=atomicRevisionSchema.extend({knowledgeNodeIds:z.array(id).max(20).refine(ids=>new Set(ids).size===ids.length,'知识点不能重复')}).strict();
