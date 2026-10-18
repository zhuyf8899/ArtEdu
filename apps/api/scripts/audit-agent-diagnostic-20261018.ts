/** Two extra calls ONLY within the remaining budget of create-web/candidate (1+2 <= 5). */
import fs from 'node:fs';
import path from 'node:path';
import {config} from 'dotenv';
import {ModelRegistry} from '../src/modules/generation/model-registry';
import {session} from './audit-agent-20261018';
async function main(){
 const root=process.cwd(),out=path.join(root,'local-artifacts/agent-audit-20261018');
 config({path:path.join(root,'apps/api/.env')});
 const recorded=JSON.parse(fs.readFileSync(path.join(out,'live.json'),'utf8'));
 const prior=recorded.find((r:any)=>r.id==='create-web'&&r.variant==='candidate');
 if(!prior||prior.modelCalls!==1)throw Error('Unexpected prior call count');
 if(fs.existsSync(path.join(out,'diagnostic-started.json')))throw Error('Diagnostics already started; refuse duplicate paid requests');
 fs.writeFileSync(path.join(out,'diagnostic-started.json'),JSON.stringify({group:'create-web/candidate',previousCalls:1,additionalCalls:2}));
 const source=fs.readFileSync(path.join(root,'apps/api/scripts/audit-agent-20261018.ts'),'utf8');
 const block=source.match(/const proposed=(\[[\s\S]*?\]\.join\('\\n'\));/)?.[1];
 if(!block)throw Error('Candidate prompt extraction failed');
 const prompt=new Function('return '+block)();
 const captured=await session([{kind:'text',content:'capture'}],{scenario:'webpage_generation',systemPrompt:prompt,prompt:'直接做一个有分类筛选的学生作品画廊网页，包含6个用CSS或SVG画的作品缩略图。请保存到工作区，给我可打开的预览，不要只写实施说明。'});
 const req=captured.requests[0],registry=new ModelRegistry(),adapter=registry.getForJob({jobType:'chat',providerId:prior.providerId});
 const nativeFetch=globalThis.fetch,results:any[]=[],pending:Promise<void>[]=[];
 globalThis.fetch=(async(...args:any[])=>{
   const response=await (nativeFetch as any)(...args);
   const clone=response.clone();
   pending.push(clone.json().then((body:any)=>{
     const c=body.choices?.[0],m=c?.message;
     results.push({status:response.status,finishReason:c?.finish_reason,usage:body.usage,contentLength:m?.content?.length||0,reasoningCharacterCount:m?.reasoning_content?.length||0,tools:(m?.tool_calls||[]).map((t:any)=>{let valid=true;try{JSON.parse(t.function.arguments)}catch{valid=false}return {name:t.function.name,argumentLength:t.function.arguments.length,validJson:valid};})});
   }).catch(e=>{results.push({diagnosticError:e.message});}));
   return response;
 }) as typeof fetch;
 try{
   for(const mode of ['provider-default','thinking-disabled']){
     let error='';
     try{await adapter.execute({jobType:'chat',messages:req.messages,parameters:{...req.parameters,maxTokens:2400,...(mode==='thinking-disabled'?{providerOptions:{thinking:{type:'disabled'}}}:{})}});}catch(e){error=(e as Error).message;}
     await Promise.all(pending);
     const item=results.at(-1);if(item){item.mode=mode;item.adapterError=error;}
     fs.writeFileSync(path.join(out,'diagnostic.json'),JSON.stringify({group:'create-web/candidate',previousCalls:1,additionalCalls:2,results},null,2));
     console.log(JSON.stringify({mode,...item}));
   }
 }finally{globalThis.fetch=nativeFetch;}
}
main().catch(e=>{console.error(e.message);process.exitCode=1});
