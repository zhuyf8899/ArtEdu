import { esc, uid } from './connected-api.js';
import { ctx, toast, busy } from './connected.js';
export function matchCourses(courses, topic) {
  const words=[...new Set(topic.toLowerCase().match(/[a-z0-9]+|[\u4e00-\u9fff]{2}/g)||[])];
  return courses.map(c=>({c,score:words.reduce((sum,w)=>sum+(JSON.stringify([c.title,c.desc,c.tags,c.type]).toLowerCase().includes(w)?1:0),0)})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score).slice(0,8).map(x=>x.c);
}
export function initCurriculum() {
  const saved=document.getElementById('saved-curriculum');
  const renderSaved=()=>{if(!saved)return;const paths=ctx.state.get('curriculum-paths',[]);saved.hidden=!paths.length;saved.innerHTML='<span class="eyebrow">MY LEARNING PATHS</span><h2>我的课程体系</h2>'+paths.map(p=>`<article class="saved-path"><h3>${esc(p.title)}</h3><ol>${p.courses.map(c=>`<li><a href="atomic-courses-particles.html?course=${encodeURIComponent(c.id)}">${esc(c.title)}</a></li>`).join('')}</ol><footer><span>${p.courses.length} 门课程 · ${p.duration} 分钟</span><button class="remove-path" data-remove="${esc(p.id)}">移除</button></footer></article>`).join('');};
  if(saved)saved.onclick=e=>{const b=e.target.closest('[data-remove]');if(b)void busy(b,async()=>{await ctx.state.set('curriculum-paths',ctx.state.get('curriculum-paths',[]).filter(p=>p.id!==b.dataset.remove));renderSaved();toast('课程体系已移除');}).catch(()=>{});};renderSaved();
  const form=document.getElementById('curriculum-form');if(!form)return;
  form.querySelector('small').textContent='依据已发布课程目录匹配；不会补造尚未发布的课程。';
  const messages=document.getElementById('curriculum-messages'),input=document.getElementById('curriculum-query');
  function recommend(topic) {
    const courses=matchCourses(ctx.courses,topic);
    messages.innerHTML=`<div class="curriculum-question">${esc(topic)}</div><section class="path-result"><span class="eyebrow">YOUR LEARNING PATH</span><h2>${esc(topic)} · 学习路径</h2>${courses.length?`<p>根据课程标题、分类与知识点匹配，建议顺序可作为学习参考。</p><ol class="path-list">${courses.map((c,i)=>`<li><span class="path-number">${i+1}</span><div><h3>${esc(c.title)}</h3><p>${esc(c.desc)}</p><small>${esc(c.duration)}</small></div></li>`).join('')}</ol><button class="button" id="save-path">加入我的课程体系 ＋</button>`:'<p class="morph-empty">当前没有匹配的已发布课程，待教师提供内容后再试。</p>'}</section>`;
    const button=messages.querySelector('#save-path');if(button)button.onclick=()=>busy(button,async()=>{const path={id:uid(),topic,title:topic+' · 学习路径',duration:courses.reduce((n,c)=>n+(c.estimatedMinutes||0),0),courses:courses.map(c=>({id:c.id,title:c.title})),savedAt:new Date().toISOString()};await ctx.state.set('curriculum-paths',[path,...ctx.state.get('curriculum-paths',[])]);button.textContent='已加入我的空间';toast('课程体系已保存到账号');}).then(()=>button.disabled=true).catch(()=>{});
  }
  form.onsubmit=e=>{e.preventDefault();const topic=input.value.trim();if(topic)recommend(topic);};document.querySelectorAll('[data-topic]').forEach(b=>b.onclick=()=>recommend(b.dataset.topic));
  const topic=new URLSearchParams(location.search).get('topic');if(topic)recommend(topic);
}
