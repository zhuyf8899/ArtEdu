(()=>{'use strict';
const $=id=>document.querySelector(`[data-node-id="${id}"]`),page=document.body.dataset.space;
const fit=()=>document.documentElement.style.setProperty('--canvas-scale',Math.min(1,document.body.clientWidth/1920));fit();addEventListener('resize',fit);
let timer;function toast(t){const n=document.querySelector('.space-toast');n.textContent=t;n.classList.add('show');clearTimeout(timer);timer=setTimeout(()=>n.classList.remove('show'),3000)}
function action(id,fn,label){const n=$(id);if(!n)return;n.setAttribute('role','button');n.tabIndex=0;if(label)n.setAttribute('aria-label',label);n.addEventListener('click',fn);n.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();fn(e)}})}
function link(id,url,label){const n=$(id);if(!n)return;if(n.tagName==='A'){n.href=url;if(label)n.setAttribute('aria-label',label)}else action(id,()=>location.href=url,label)}
function input(id,placeholder,prefill=false){const n=$(id);if(!n)return;const t=document.createElement('textarea');t.style.cssText=n.style.cssText;t.dataset.nodeId=id;t.style.height=page==='home'?'52px':'44px';t.style.border='0';t.style.background='transparent';t.style.resize='none';t.style.padding='0';t.placeholder=placeholder;t.setAttribute('aria-label',placeholder);if(prefill)t.value=n.textContent.trim();n.replaceWith(t);return t}
function toChat(text){if(text?.trim())sessionStorage.setItem('morph-chat-prompt',text.trim());location.href='chat.html'}
function modal(title,body){const d=document.createElement('dialog');d.className='space-dialog';d.innerHTML=`<h2>${title}</h2>${body}<button class="button secondary" data-close>关闭</button>`;document.body.append(d);d.querySelector('[data-close]').onclick=()=>d.close();d.onclose=()=>d.remove();d.showModal();return d}
if(page==='home'||page==='chat'){const a=document.querySelector('.nav-links a[href="chat.html"]');a?.classList.add('active');if(page==='chat')a?.setAttribute('aria-current','page')}
if(page==='home'){
 document.querySelectorAll('[data-node-id] p').forEach(n=>{if(/^[\x00-\x7F\s·]+$/.test(n.textContent.trim())||n.dataset.nodeId==='382:1986'){n.style.whiteSpace='nowrap'}});
 const t=input('382:2181','描述你想创作的内容…',true);
 action('382:2204',()=>toChat(t.value),'开始对话');['382:2166','382:2173','382:2174'].forEach(id=>link(id,'chat.html','进入对话模式'));
 action('382:2167',()=>{t.focus();toast('生图模式：填写想法后，发送到创作空间继续整理。')},'生图模式');
 action('382:2186',e=>{const n=$('382:2186');const on=n.getAttribute('aria-pressed')!=='false';n.setAttribute('aria-pressed',String(!on));n.style.opacity=on?'.5':'1';toast(on?'已关闭智能搜索选项':'已开启智能搜索选项')},'切换智能搜索');
 link('382:2187','skill-tools.html');link('382:2194','chat.html');action('382:2203',()=>toast('当前预览支持文字输入，暂未接入语音服务。'),'语音输入');
 action('382:2202',()=>toast('当前预览使用设计稿中的模型选项，尚未接入模型服务。'),'选择模型');
 action('382:2184',()=>{const f=document.createElement('input');f.type='file';f.onchange=()=>toast(f.files.length?'已选择参考文件：'+f.files[0].name:'未选择文件');f.click()},'添加参考文件');
 t.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();toChat(t.value)}});
 [['427:2159','case-community.html'],['275:1155','case-community.html'],['427:2163','case-community.html'],['427:2164','case-community.html'],['427:2171','atomic-courses-particles.html'],['275:1196','atomic-courses-particles.html'],['427:2175','atomic-courses-particles.html'],['427:2176','atomic-courses-particles.html']].forEach(([id,url])=>link(id,url));
}
if(page==='chat'){
 const log=$('274:1772'),title=$('274:1769'),t=input('274:1802','继续描述你的想法…');let current='云纹设计';const original=log.innerHTML;
 const read=()=>{try{return JSON.parse(localStorage.getItem('morph-chat-history')||'{}')}catch{return {}}};let history=read();
 function refreshHistory(){document.querySelector('.saved-chats')?.remove();const box=document.createElement('div');box.className='saved-chats';Object.keys(history).filter(k=>!['云纹设计','海报色彩方向探索','一节字体入门课','品牌视觉参考整理'].includes(k)).slice(-6).reverse().forEach(k=>{const b=document.createElement('button');b.textContent=k;b.onclick=()=>switchTo(k);box.append(b)});$('274:1763').before(box)}
 function append(text,save=true){const n=document.createElement('div');n.className='local-message';n.textContent=text;log.append(n);const hint=document.createElement('p');hint.className='local-feedback';hint.textContent='已保存你的想法。当前为交互预览，尚未接入 AI 生成服务。';log.append(hint);if(save){(history[current]??=[]).push(text);try{localStorage.setItem('morph-chat-history',JSON.stringify(history))}catch{toast('浏览器未允许保存历史')}}log.scrollTop=log.scrollHeight;refreshHistory()}
 function bindResponse(){action('274:1795',async()=>{try{await navigator.clipboard.writeText($('274:1776').innerText);toast('已复制设计建议')}catch{toast('无法写入剪贴板，请选中文字复制。')}},'复制设计建议');action('274:1797',()=>toast('重新生成需要连接 AI 服务，当前保留设计稿示例。'));action('274:1799',()=>{t.value='将传统云纹简化为单色几何模块，统一线宽，通过疏密与留白构建现代海报，清晰网格，高对比视觉。';t.focus()});['274:1781','274:1785','274:1789'].forEach(id=>action(id,()=>{t.value='继续探索「'+$(id).querySelectorAll('p')[1].textContent.trim()+'」方向';t.focus()}))}
 function switchTo(name,initial=false){current=name;title.textContent=name==='云纹设计'?'传统纹样的现代设计转译':name;log.innerHTML=name==='云纹设计'?original:'';if(name==='云纹设计')bindResponse();(history[name]||[]).forEach(x=>append(x,false));if(!initial)t.focus()}
 function send(){if(!t.value.trim())return t.focus();append(t.value.trim());t.value=''}
 action('274:1805',send,'发送消息');t.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send()}});
 function fresh(){switchTo('新对话 '+new Date().toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',second:'2-digit'}));toast('已新建对话')}
 action('274:1748',fresh);action('274:1770',fresh);
 [['274:1751','云纹设计'],['274:1754','海报色彩方向探索'],['274:1757','一节字体入门课'],['274:1760','品牌视觉参考整理']].forEach(([id,name])=>action(id,()=>{switchTo(name);document.querySelectorAll('[data-name^="历史会话"]').forEach(n=>n.style.background=n===$(id)?'#e7e1fdd9':'#ffffff40')}));
 action('274:1804',()=>{const f=document.createElement('input');f.type='file';f.onchange=()=>toast(f.files.length?'已选择参考文件：'+f.files[0].name:'未选择文件');f.click()},'添加参考文件');
 switchTo('云纹设计',true);refreshHistory();const draft=sessionStorage.getItem('morph-chat-prompt');if(draft){sessionStorage.removeItem('morph-chat-prompt');switchTo('新的创作想法',true);append(draft)}
}
if(page==='profile'){
 [['263:2846','overview'],['263:2850','atlas'],['263:2854','projects'],['263:2858','learning']].forEach(([id,target])=>action(id,()=>document.getElementById(target).scrollIntoView({behavior:'smooth'})));
 link('263:2753','atomic-courses-particles.html');
 action('263:2811',()=>modal('额度明细','<p>设计稿示例额度：232 / 300。</p><p>当前未连接账户服务，实际额度以正式平台为准。</p>'));
 ['263:3092','263:3101','263:3132','263:3164'].forEach(id=>link(id,'chat.html'));
 ['263:3291','263:3319','263:3347','263:3375','263:3403'].forEach(id=>link(id,'atomic-courses-particles.html'));
 const axes=['图像生成 · 92','视频生成 · 68','动态影像 · 89','界面原型 · 54','代码交互 · 51','三维建模 · 43','品牌系统 · 73','视觉叙事 · 84'];['263:2930','263:2933','263:2936','263:2939','263:2942','263:2945','263:2948','263:2951'].forEach((id,i)=>action(id,()=>{$('263:2959').textContent=axes[i];$('263:2961').textContent='已固定此维度。能力数据来自当前 Figma 设计稿。'}));
 const all=[...document.querySelectorAll('p')];const prompt=all.find(n=>n.textContent.includes('输入全局任务'));if(prompt){const t=input(prompt.dataset.nodeId,'输入全局任务…');t.onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();toChat(t.value)}};const send=all.find(n=>n.textContent.trim()==='发送');if(send)action(send.parentElement.dataset.nodeId,()=>toChat(t.value),'发送并进入对话')}
}
})();
document.getElementById('profile-prompt-form')?.addEventListener('submit',e=>{e.preventDefault();const text=document.getElementById('profile-prompt').value.trim();if(text){sessionStorage.setItem('morph-chat-prompt',text);location.href='chat.html'}});
