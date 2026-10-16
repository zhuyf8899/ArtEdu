import { api, esc, safeUrl } from './connected-api.js';
import { ctx, modal, toast, busy } from './connected.js';
import { card } from './connected-catalog.js';
const by=id=>document.querySelector(`[data-node-id="${id}"]`);
function defaults() { return {name:ctx.actor.displayName,bio:'',school:'',major:'',grade:'',work:'',background:'',position:'center'}; }
function applyProfile() {
  const p=ctx.state.get('profile',defaults());document.title=p.name+' · 我的空间 · MORPH LAB';
  by('263:2764').textContent=p.name;by('263:2840').textContent=p.name.slice(0,1);by('263:2782').textContent=[p.school,p.grade,p.major].filter(Boolean).join(' · ')||'个人资料待补充';by('263:2785').textContent=p.bio||'还没有填写个人简介';
  const cover=by('263:2746').querySelector('img');cover.src=p.background||'assets/digital-organism-cover-v1.png';cover.alt='个人背景';cover.style.objectPosition=p.position;
  document.querySelectorAll('.account-name').forEach(n=>n.textContent=p.name);document.querySelectorAll('.account-trigger .avatar').forEach(n=>n.textContent=p.name.slice(0,1));
}
async function smallBackground(file) {
  if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>3*1024*1024)throw new Error('请选择不超过3MB的PNG、JPG或WebP图片');
  const bitmap=await createImageBitmap(file);try{const canvas=document.createElement('canvas'),scale=Math.min(1,1280/bitmap.width,1280/bitmap.height);canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);const data=canvas.toDataURL('image/jpeg',.75);if(data.length>650000)throw new Error('图片内容过大，请使用较小的背景图');return data;}finally{bitmap.close();}
}
function editProfile() {
  const p=ctx.state.get('profile',defaults()),fields=[['name','昵称',30],['school','院校',60],['major','专业',60],['grade','年级',30],['work','代表作品',60]];
  const d=modal(`<h2 id="modal-title">编辑个人资料</h2><form class="morph-dialog-form">${fields.map(([key,label,max])=>`<label>${label}<input name="${key}" maxlength="${max}" value="${esc(p[key])}" ${key==='name'?'required':''}></label>`).join('')}<label>个人简介<textarea name="bio" maxlength="300">${esc(p.bio)}</textarea></label><label>个人背景图<input type="file" name="background" accept="image/png,image/jpeg,image/webp"></label><label>背景位置<select name="position">${['center','left center','right center','center top'].map((value,i)=>`<option value="${value}" ${value===p.position?'selected':''}>${['居中','靠左','靠右','靠上'][i]}</option>`).join('')}</select></label><label><input type="checkbox" name="reset">恢复默认背景</label><p class="morph-form-error" role="alert"></p><button class="button">保存资料</button></form>`);
  d.querySelector('form').onsubmit=e=>{e.preventDefault();const form=e.currentTarget;void busy(form.querySelector('button'),async()=>{
    const next={...p};for(const [key]of fields)next[key]=form.elements[key].value.trim();next.bio=form.elements.bio.value.trim();next.position=form.elements.position.value;
    if(form.elements.reset.checked)next.background='';if(form.elements.background.files[0])next.background=await smallBackground(form.elements.background.files[0]);
    await ctx.state.set('profile',next);applyProfile();d.close();toast('个人资料已保存到账号');
  }).catch(error=>form.querySelector('.morph-form-error').textContent=error.message);};
}
export async function initProfile() {
  applyProfile();by('263:2748').onclick=editProfile;
  const summary=ctx.learning.summary||{},publicWorks=ctx.mine.filter(w=>w.status==='approved');
  document.querySelector('.profile-statistics').innerHTML=`<span><strong>${summary.enrolledCourses||0}</strong> 已选课程</span><span><strong>${summary.completedLessons||0}</strong> 已完成节点</span><span><strong>${publicWorks.length}</strong> 公开作品</span>`;
  document.querySelector('.profile-interests').innerHTML='';
  const quota=ctx.home.creation?.quota||{},credits=document.querySelector('.credits-card');credits.querySelector('strong').textContent=quota.dailyLimit==null?'未设置':String(Math.max(0,quota.dailyLimit-(quota.dailyUsed||0)));credits.querySelector('p').textContent='今日剩余调用次数';credits.querySelector('dl').innerHTML=`<div><dt>进行中课程</dt><dd>${ctx.courses.filter(c=>c.progress<100).length}</dd></div><div><dt>公开作品</dt><dd>${publicWorks.length}</dd></div>`;
  const chart=document.querySelector('.portrait-layout');chart.innerHTML='<p>正在读取学习画像…</p>';
  try{const abilities=await api('/me/ability-portrait');chart.innerHTML=`<div class="portrait-details"><h3>学习目标进度</h3>${abilities.goals.map(g=>`<p>${esc(g.title)} · ${g.progressPercent}%（${g.completedNodes}/${g.totalNodes} 节点）</p>`).join('')||'<p>暂无学习画像记录</p>'}<a href="/my-learning?atlas=knowledge">查看知识图谱与学习轨迹 ↗</a></div>`;}catch(error){chart.innerHTML=`<p>${esc(error.message)}</p>`;}
  document.querySelector('.profile-projects').innerHTML=ctx.mine.map(w=>`<article class="project-card">${w.previewUrl?`<img src="${esc(safeUrl(w.previewUrl))}" alt="${esc(w.title)}">`:''}<div class="project-body"><h3>${esc(w.title)}</h3><p>${esc(w.summary)}</p><small>${esc(({draft:'草稿',pending:'待审核',approved:'已公开',rejected:'已退回'})[w.status]||w.status)}</small><a href="/community">查看与编辑 ↗</a></div></article>`).join('')||'<p class="morph-empty">暂无个人作品</p>';
  const extra=document.createElement('section');extra.className='profile-native-section';extra.innerHTML='<h2>我的收藏与草稿</h2><div class="morph-links"><a href="/my-learning">学习计划与笔记 ↗</a><a href="/studio">工作流 ↗</a></div>';
  const favorites=ctx.state.get('favorites',[]),cases=(ctx.learning.favorites||[]);extra.innerHTML+=`<h3>收藏内容</h3>${favorites.map(f=>{const item=(f.type==='course'?ctx.courses:ctx.tools).find(c=>c.id===f.id);return `<p>${esc(item?.title||'已收藏内容')} <button class="button secondary" data-remove-favorite="${esc(f.id)}" data-type="${f.type}">取消收藏</button></p>`;}).join('')}${cases.map(w=>`<p>${esc(w.title)} <a href="case-community.html">查看案例 ↗</a></p>`).join('')}${!favorites.length&&!cases.length?'<p>暂无收藏</p>':''}`;
  extra.innerHTML+='<h3>Remix 草稿</h3>'+ctx.state.get('remixes',[]).map(d=>`<p><a href="chat.html?remix=${encodeURIComponent(d.id)}">${esc(d.title)} ↗</a></p>`).join('');
  extra.innerHTML+='<h3>工具推荐</h3>'+ctx.state.get('tool-submissions',[]).map(d=>`<p><a href="${esc(safeUrl(d.url))}" target="_blank" rel="noopener noreferrer">${esc(d.title)}</a> · ${esc(d.reason)}</p>`).join('');
  document.querySelector('main').append(extra);extra.querySelectorAll('[data-remove-favorite]').forEach(b=>b.onclick=()=>busy(b,async()=>{await ctx.state.set('favorites',ctx.state.get('favorites',[]).filter(f=>!(f.id===b.dataset.removeFavorite&&f.type===b.dataset.type)));b.closest('p').remove();toast('已取消收藏');}).catch(()=>{}));
}
