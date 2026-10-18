import vm from 'node:vm';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {checkBrowser} from './browser-check.cjs';
import {executePlatformTool as original,platformToolDefinitions as originalDefinitions} from '../../src/modules/agent/agent-tools';
import {imageGenerationParametersSchema} from '../../src/modules/generation/generation.contracts';
import {z} from 'zod';
const imageArguments=imageGenerationParametersSchema.extend({prompt:z.string().trim().min(1).max(1500),imageCount:z.literal(1).default(1)}).strict();
/** Bind a direct, affirmative instruction to this exact workflow; quoted/negated discussion never authorizes it. */
export function workflowAuthorization(prompt:string,target:string){
  const direct=prompt.replace(/[“「『][^”」』]*[”」』]/g,'').replace(/"[^"\n]*"/g,'');
  const escaped=target.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  if(/[?？]|不要|不许|别|暂不|尚未|未确认|不同意|取消/.test(direct)||!target||!new RegExp('(?:^|[^A-Za-z0-9_-])'+escaped+'(?:$|[^A-Za-z0-9_-])').test(direct))return false;
  return /^(?:请)?(?:我)?(?:确认|同意|批准)(?:立即)?(?:启动|运行|执行)/.test(direct.trim());
}
export const platformToolDefinitions=[...originalDefinitions,{type:'function' as const,function:{name:'generate_image',description:'调用已配置的文生图服务生成一张真实图片，返回站内私有图片产物。仅在用户明确要求生图时调用；只解释或讨论时不要调用。不能用保存SVG或文字说明冒充调用成功。',parameters:{type:'object',properties:{prompt:{type:'string',minLength:1,maxLength:1500},size:{type:'string',pattern:'^\\d{3,4}x\\d{3,4}$'},aspectRatio:{type:'string',enum:['1:1','4:3','3:4','16:9','9:16']},imageCount:{type:'integer',enum:[1]}},required:['prompt']}}}];
/** Narrow experimental wrapper; authorization and base tools still use production implementations. */
export async function executePlatformTool(call:any,context:any,dependencies:any){
  if(call.function.name==='generate_image'){
    const {prompt,...parameters}=imageArguments.parse(JSON.parse(call.function.arguments));
    if(context.request.signal?.aborted)throw Error('用户已暂停，未提交生图请求');
    const result=await dependencies.generation.runJob(dependencies.actor,{jobType:'image',prompt,context:[],parameters});
    if(result.job?.status==='failed')throw Error('图片生成任务失败');
    const artifact=result.artifact;
    if(!artifact||!/^image\/(?:png|jpeg|webp|gif|avif)$/.test(artifact.mimeType||'')||!/^\/api\/(?!\/)/.test(artifact.downloadUrl||''))throw Error('生图服务没有返回可交付的私有图片产物');
    const review=result.visualReview;
    return {status:'succeeded',image:artifact,openUrl:artifact.downloadUrl,jobId:result.job?.id,visualValidation:review?.status==='pass'?'pass':review?.status==='fail'?'visual_failed':'pending_visual',visualIssues:review?.issues||[],note:review?.status==='pass'?'独立视觉复核通过':'图片文件已生成，未满足视觉验收；不可根据请求描述声称无文字或完全符合构图。'};
  }
  if(call.function.name==='start_workflow_run'){
    const args=z.object({workflowId:z.string().min(1),context:z.record(z.unknown()).optional()}).strict().parse(JSON.parse(call.function.arguments));
    const latest=[...context.messages].reverse().find((m:any)=>m.role==='user')?.content||'';
    if(!workflowAuthorization(latest,args.workflowId))return {status:'confirmation_required',message:'需要用户针对这个工作流明确确认启动。'};
    // Preserve all original validation/execution; normalize only after the action and exact target have been verified.
    const messages=context.messages.map((m:any,index:number)=>index===context.messages.lastIndexOf([...context.messages].reverse().find((x:any)=>x.role==='user'))?{...m,content:'确认。'}:m);
    return original(call,{...context,messages},dependencies);
  }
  let deps=dependencies;
  if(call.function.name==='generate_document'){
    const inherited=context.request.messages.filter((m:any)=>['user','assistant'].includes(m.role)).map((m:any)=>({role:m.role,content:m.content.slice(0,20000)})).slice(-20);
    deps={...dependencies,generation:{runJob:(actor:any,input:any)=>dependencies.generation.runJob(actor,{...input,context:inherited})}};
  }
  const result:any=await original(call,context,deps);
  if(call.function.name!=='check_page')return result;
  const args=JSON.parse(call.function.arguments),page=await dependencies.workspace.read(dependencies.actor,args.path);
  const issues=[...result.issues],styles=[...page.content.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map(m=>m[1]);
  if(!result.references.stylesheets.length&&styles.length&&styles.every(s=>!s.replace(/\/\*[\s\S]*?\*\//g,'').trim()))issues.push({level:'fail',message:'内联样式为空，不能把有style标签当作已有样式。'});
  const scripts:[string,string][]=[...page.content.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].map(m=>[m[1],m[2]]);
  const code:string[]=[...styles];
  const base=args.path.includes('/')?args.path.slice(0,args.path.lastIndexOf('/')+1):'';
  for(const file of [...result.references.stylesheets,...result.references.scripts]){
    if(/^[a-z]+:|^\/|\.\./i.test(file))continue;
    const found=await dependencies.workspace.read(dependencies.actor,base+file).catch(()=>null);if(found)code.push(found.content);
  }
  for(const [attrs,body] of scripts){
    code.push(body);
    if(!/\bsrc\s*=|type\s*=\s*['"](?:module|application\/(?:json|ld\+json))/.test(attrs)&&body.trim()){
      try{new vm.Script(body);}catch{issues.push({level:'fail',message:'内联经典脚本存在语法错误。'});}
    }
  }
  if(code.some(s=>/(?:url\(\s*['"]?|@import\s+['"])(?:https?:)?\/\//i.test(s)))issues.push({level:'fail',message:'CSS引用了离线预览不可用的外部资源。'});
  if(code.some(s=>/\b(?:fetch|XMLHttpRequest|WebSocket)\s*\(/.test(s)))issues.push({level:'fail',message:'脚本包含离线预览禁止的网络请求。'});
  let browser:any=null;
  if(context.request.parameters?.metadata?.sandboxBrowserCheck==='true'&&!issues.some(i=>i.level==='fail')){
    const listing=await dependencies.workspace.list(dependencies.actor,'.');
    const files=[];
    for(const item of listing.items.filter((f:any)=>/\.(?:html?|css|js|svg|json)$/i.test(f.path)).slice(0,30)){
      const file=await dependencies.workspace.read(dependencies.actor,item.path);files.push([item.path,file.content]);
    }
    browser=await checkBrowser(files,path.resolve('local-artifacts/agent-sandbox-20261018/browser-tools',randomUUID()),'generic');
    if(!browser.passed)issues.push({level:'fail',message:'浏览器渲染检查未通过：'+JSON.stringify({checks:browser.checks,errors:browser.errors})});
  }
  return {...result,openUrl:dependencies.workspace.openUrl(page.path),verdict:issues.some(i=>i.level==='fail')?'fail':result.verdict,issues,browser,scope:browser?'静态检查及独立Chrome渲染检查；不代表任意业务交互或审美保证':'静态补充检查；没有浏览器视觉或交互验收'};
}
