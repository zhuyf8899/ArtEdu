import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {AiMarkdown} from '../../../admin-console/src/AiMarkdown.js';
const root=process.cwd(),out=path.join(root,'local-artifacts/agent-audit-20261018');
const req=createRequire(path.join(root,'admin-console/package.json'));
const {createElement}=req('react'),{renderToStaticMarkup}=req('react-dom/server');
const raw=JSON.parse(fs.readFileSync(path.join(out,'live.json'),'utf8'));
const summary=raw.map((r:any)=>{
 const rendered=renderToStaticMarkup(createElement(AiMarkdown,null,r.final||''));
 const anchors=[...rendered.matchAll(/<a\b[^>]*href="([^"]+)"/g)].map(m=>m[1]);
 const files=r.files.map(([p,html]:[string,string])=>{
   const scripts=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);
   let jsSyntax='pass',counter:any=null,error='';
   try{
     for(const script of scripts)new vm.Script(script);
     if(r.id==='modify-web'){
       const elements:any={};
       for(const match of html.matchAll(/\bid=["']([^"']+)["']/g)){
         const listeners:any={};
         elements[match[1]]={textContent:'',offsetWidth:0,classList:{add(){},remove(){}},addEventListener(name:string,fn:any){listeners[name]=fn;},click(){listeners.click?.();this.onclick?.();}};
       }
       const context=vm.createContext({__elements:elements,document:{getElementById:(id:string)=>elements[id]},window:{setTimeout:(fn:any)=>fn()}});
       for(const script of scripts)vm.runInContext(script,context,{timeout:1000});
       vm.runInContext('__elements.b.click();__elements.b.click();__elements.b.click()',context,{timeout:1000});
       counter={button:String(elements.b?.textContent),display:String(elements.count?.textContent),passed:String(elements.count?.textContent)==='3'};
     }
   }catch(e){error=(e as Error).message;jsSyntax='error';}
   return {path:p,bytes:Buffer.byteLength(html),scripts:scripts.length,jsSyntax,counter,error,retainsOriginalHeading:r.id==='broken-web'?html.includes('作品展'):undefined};
 });
 return {id:r.id,variant:r.variant,status:r.status,reason:r.reason,latencyMs:r.latencyMs,
   modelCalls:r.reason==='AUDIT_CALL_BUDGET'?5:r.modelCalls,
   originalCounter:r.modelCalls,
   counterNote:r.reason==='AUDIT_CALL_BUDGET'?'Original counter included the blocked sixth attempt; only five adapter calls executed.':undefined,
   checkVerdicts:r.tools.filter((t:any)=>t.name==='check_page').map((t:any)=>t.output.verdict),
   tools:r.events.filter((e:any)=>e.kind==='tool'&&e.status!=='running').map((e:any)=>({name:e.name,status:e.status})),
   files,clickablePreviewLinks:anchors.filter(h=>h.includes('workspace-preview')),hasBarePreviewPath:(r.final||'').includes('/api/agent-runs/workspace-preview/'),final:r.final};
});
const total=summary.reduce((n:number,r:any)=>n+r.modelCalls,0);
fs.writeFileSync(path.join(out,'live-summary.json'),JSON.stringify({note:'No visual browser test: in-app browser could not reach host loopback. Counter test uses actual generated JS with a minimal DOM sandbox, not a complete browser.',primaryAdapterCalls:total,supplementaryDiagnosticCalls:2,totalAdapterCalls:total+2,results:summary},null,2));
for(const r of summary)console.log(JSON.stringify({id:r.id,variant:r.variant,status:r.status,calls:r.modelCalls,files:r.files.length,check:r.checkVerdicts,clickableLinks:r.clickablePreviewLinks.length,counter:r.files.map((f:any)=>f.counter?.passed)}));
