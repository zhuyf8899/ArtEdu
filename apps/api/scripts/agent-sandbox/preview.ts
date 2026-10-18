import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {AiMarkdown} from '../../../../admin-console/src/AiMarkdown.js';
import {activityLabel,visibleActivities} from '../../../../admin-console/src/agentActivity.js';
import {renderView,esc} from './render.mjs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const root=process.cwd(),out=path.join(root,'local-artifacts/agent-sandbox-20261018');
const req=createRequire(path.join(root,'admin-console/package.json'));
const {createElement}=req('react'),{renderToStaticMarkup}=req('react-dom/server');
const live=JSON.parse(fs.readFileSync(path.join(root,'local-artifacts/agent-audit-20261018/live.json'),'utf8'));
const replay=JSON.parse(fs.readFileSync(path.join(out,'real-output-replay.json'),'utf8'));
const results=JSON.parse(fs.readFileSync(path.join(out,'results.json'),'utf8'));
const cards=[];
function saveFiles(key:string,files:any[]){
 const base=path.join(out,'previews',key);fs.mkdirSync(base,{recursive:true});
 for(const [name,content] of files){const target=path.resolve(base,name);if(!target.startsWith(base+path.sep))throw Error('Unsafe preview path');fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,content);}
 return (artifact:any)=>'./previews/'+key+'/'+artifact.path.split('/').map(encodeURIComponent).join('/');
}
for(const r of replay){
 const source=live.find((s:any)=>s.id===r.id&&s.variant===r.variant),key=r.id+'-'+r.variant;
 const resolvePreview=saveFiles(key,r.files);
 const activity=visibleActivities(source.events).map((e:any)=>`<li>${esc(activityLabel(e))}</li>`).join('');
 const baseline=`<section class="outcome"><span class="badge">Run: ${esc(source.status)}</span></section><ol>${activity}</ol>${renderToStaticMarkup(createElement(AiMarkdown,null,source.final||''))}`;
 cards.push({title:`真实输出回放 · ${r.id} · ${r.variant}`,note:'复用已记录的模型输出；没有重新调用模型。候选视图只改变交付判定与呈现，不代表模型重新执行了任务。',baseline,candidate:renderView(r.view,{resolvePreview})});
}
for(const r of results.comparisons){const resolvePreview=saveFiles('scripted-'+r.id,r.candidate.files);cards.push({title:'边界场景 · '+r.title,note:'脚本模型触发真实候选编排，用于验证逻辑，不代表真实模型成功率。',baseline:`<span class="badge">Run: ${esc(r.baseline.status)}</span><p>${esc(r.baseline.final)}</p>`,candidate:renderView(r.view,{resolvePreview})});}
const payload=JSON.stringify(cards).replace(/</g,'\u003c');
fs.writeFileSync(path.join(out,'index.html'),`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Agent 本地实验台</title><style>
*{box-sizing:border-box}body{margin:0;background:#f5f6f9;color:#1d2737;font:15px/1.65 system-ui,"Microsoft YaHei",sans-serif}main{max-width:1260px;margin:36px auto;padding:0 24px}h1{font-size:28px;margin-bottom:4px}p{overflow-wrap:anywhere}.muted,small{color:#637083}select{max-width:100%;padding:12px;background:#fff;border:1px solid #ccd3df;border-radius:8px;font:inherit}.cols{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:20px}.panel{background:#fff;border:1px solid #e0e4eb;border-radius:12px;padding:24px;min-width:0}.panel h2{font-size:19px;margin-top:0}h3{font-size:15px;margin:20px 0 8px}.badge{display:inline-block;padding:3px 9px;border-radius:6px;background:#e9edf4;font-size:12px}.succeeded{background:#e2f5e9;color:#176439}.failed,.validation_failed{background:#fde8e7;color:#9d302b}.partial,.needs_confirmation{background:#fff1d3;color:#865b0c}.running{background:#e4edff;color:#255caa}.outcome{border-bottom:1px solid #e8ebf1;padding-bottom:10px}.artifacts{margin-bottom:20px}.artifact{padding:14px;border:1px solid #dce3ee;border-radius:8px;margin:8px 0;display:grid;gap:5px}.artifact a{color:#255caa;font-weight:600}.steps{padding-left:20px}.steps li{padding:7px 0}.steps li>div{display:flex;justify-content:space-between;gap:10px}.steps small{display:block}pre{white-space:pre-wrap;overflow-wrap:anywhere}a{color:#255caa}@media(max-width:800px){.cols{grid-template-columns:1fr}main{padding:0 14px}.panel{padding:16px}}
</style><main><h1>Agent 本地实验台</h1><p class="muted">隔离候选逻辑 · ${results.passed}/${results.tests} 项测试通过 · 未接入生产 · 本页不调用模型</p><select id="cases" aria-label="选择测试场景"></select><p id="note" class="muted"></p><div class="cols"><section class="panel"><h2>现有输出与状态</h2><div id="baseline"></div></section><section class="panel"><h2>候选交付与进度视图</h2><div id="candidate"></div></section></div><p class="muted">“打开成果”指向同目录中的离线文件。主站真实产物地址保留在 JSON 记录中；静态检查通过不等同于浏览器视觉验收。</p></main><script>const cases=${payload};const menu=document.getElementById('cases');cases.forEach((item,i)=>{const option=document.createElement('option');option.value=i;option.textContent=item.title;menu.append(option)});function show(){const item=cases[Number(menu.value)||0];document.getElementById('note').textContent=item.note;document.getElementById('baseline').innerHTML=item.baseline;document.getElementById('candidate').innerHTML=item.candidate}menu.addEventListener('change',show);menu.value=2;show();</script></html>`);
const emitted=fs.readFileSync(path.join(out,'index.html'),'utf8');
const script=[...emitted.matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)?.[1];
assert.ok(script);
const elements:any={};for(const id of ['cases','note','baseline','candidate'])elements[id]={value:'',innerHTML:'',textContent:'',append(){},addEventListener(){}};
const context=vm.createContext({document:{getElementById:(id:string)=>elements[id],createElement:()=>({})}});
vm.runInContext(script!,context,{timeout:1000});
assert.ok(elements.candidate.innerHTML.includes('<section'), 'Preview JSON escaping must restore real markup');
for(let i=0;i<cards.length;i++){elements.cases.value=i;vm.runInContext('show()',context,{timeout:1000});assert.ok(elements.note.textContent);assert.ok(elements.candidate.innerHTML.includes('<section'));}
fs.writeFileSync(path.join(out,'preview-check.json'),JSON.stringify({cases:cards.length,bootstrap:'pass',allSelections:'pass',browserVisualTest:false},null,2));
console.log(JSON.stringify({preview:path.join(out,'index.html'),cases:cards.length,bootstrap:'pass',allSelections:'pass'}));
