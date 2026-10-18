import fs from 'node:fs';import path from 'node:path';
import {presentation} from './policy.mjs';import {renderView} from './render.mjs';
const root=process.cwd(),base=path.resolve('local-artifacts/agent-sandbox-20261018/repair');
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const rounds=fs.readdirSync(base).filter(n=>/^round-[1-5]$/.test(n)).sort().map(name=>({name,data:JSON.parse(fs.readFileSync(path.join(base,name,'results.json'),'utf8'))}));
const current=rounds.at(-1),directory=path.join(base,current.name);
let body=`<h1>Agent 沙箱修复回归</h1><p>每轮完整11例，最多5轮。当前 ${escape(current.name)}。真实测试API；图片由Codex独立查看复核；工作流与文件服务隔离。</p><table><tr><th>轮次</th><th>自动通过</th><th>文本调用</th><th>图片调用</th></tr>`;
for(const round of rounds)body+=`<tr><td>${escape(round.name)}</td><td>${round.data.results.filter(c=>c.verdict==='passed').length}/11</td><td>${round.data.textCalls}</td><td>${round.data.imageCalls}</td></tr>`;
body+='</table><p>第1轮另经截图复核降为8/11；原始自动计数保留。第7项验证预算耗尽时诚实报告未完成，不要求在压力预算中交付全部40件作品。页面链接打开本轮实际保存的离线文件。</p><nav>'+current.data.results.map(c=>`<a href="#case${c.id}">${c.id} ${escape(c.title)}</a>`).join('')+'</nav>';
for(const c of current.data.results){
 body+=`<section id="case${c.id}"><h2>${c.id}. ${escape(c.title)} · ${c.verdict==='passed'?'通过':'未通过'}</h2><p>文本调用 ${c.textCalls} 次</p><pre>${escape(JSON.stringify(c.checks||{error:c.error},null,2))}</pre>`;
 for(const t of c.turns||[]){
  if(!t.delivery)continue;
  const view=presentation(t.delivery,t.events);
  for(const a of view.artifacts){let file=a.kind==='image'||a.kind==='document'?a.path:`case${String(c.id).padStart(2,'0')}/${a.path}`;a.href=fs.existsSync(path.join(directory,file))?file:null;}
  body+=renderView(view);
 }
 for(const image of [`case${String(c.id).padStart(2,'0')}/desktop.png`,`case${String(c.id).padStart(2,'0')}/mobile.png`])if(fs.existsSync(path.join(directory,image)))body+=`<a href="${escape(image)}"><img loading="lazy" src="${escape(image)}" alt="样例${c.id}浏览器截图"></a>`;
 if(c.id===11&&fs.existsSync(path.join(directory,'test11-generated.png')))body+='<figure><img src="test11-generated.png" alt="AI生成的测试素材原图"><figcaption>AI生成 · 私有下游素材原图；视觉复核记录见 image-review.json。</figcaption></figure>';
 body+='</section>';
}
body='<style>.badge{display:inline-block;border-radius:20px;padding:3px 12px;font-size:13px;margin:0 10px;background:#e9edf6}.badge.succeeded{background:#dbf4e6;color:#116842}.badge.partial,.badge.paused,.badge.needs_confirmation{background:#fff0ce;color:#875b00}.badge.failed,.badge.validation_failed{background:#ffe0e0;color:#a12121}.artifact{display:grid;gap:8px;padding:18px;background:#f4f1fb;border:1px solid #ded5f0;border-radius:12px;margin:10px 0}.steps{padding-left:22px}.steps li{margin:10px 0}.steps small,.muted{color:#6c7587}</style>'+body;
fs.writeFileSync(path.join(directory,'index.html'),`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Agent沙箱修复回归</title><style>body{font:16px/1.65 system-ui,sans-serif;max-width:1100px;margin:30px auto;padding:0 20px;background:#f4f6fb;color:#202735}h1,h2{line-height:1.3}section{background:white;border-radius:16px;padding:24px;margin:24px 0;box-shadow:0 4px 20px #1427440a}table{border-collapse:collapse}td,th{padding:10px 18px;border:1px solid #ccd4e1;text-align:left}nav{display:flex;flex-wrap:wrap;gap:10px;margin:24px 0}a{color:#5430ae}pre{white-space:pre-wrap;background:#f3f0fa;padding:16px;border-radius:8px;font-size:13px}img{max-width:100%;max-height:650px;object-fit:contain;vertical-align:top;border:1px solid #ddd;margin:10px 0}.progress{font-size:13px}figure{margin:0}figcaption{color:#626d80}</style>${body}</html>`);
console.log(JSON.stringify({report:path.join(directory,'index.html'),rounds:rounds.length,passed:current.data.results.filter(c=>c.verdict==='passed').length}));
