import { api, esc, safeUrl, uid, mapCourse, mapWork } from './connected-api.js';
import { ctx, modal, toast, busy } from './connected.js';
const image=(src,alt='',cls='')=>src?`<img src="${esc(safeUrl(src))}" alt="${esc(alt)}" class="${cls}" loading="lazy">`:'<div class="morph-empty">暂无封面</div>';
let renderCatalog=()=>{};
function saved(item) { return item.kind==='case' ? Boolean(item.favorited) : ctx.state.get('favorites',[]).some(f=>f.id===item.id&&f.type===(item.kind==='course'?'course':'tool')); }
const bookmark=item=>`<button class="bookmark" data-save="${esc(item.id)}" aria-label="${saved(item)?'取消收藏':'收藏'} ${esc(item.title)}" aria-pressed="${saved(item)}">${saved(item)?'★':'☆'}</button>`;
export function card(item) {
  const id=esc(item.id),title=esc(item.title),desc=esc(item.desc);
  if(item.kind==='course')return `<article class="course-card">${bookmark(item)}<div class="course-cover">${image(item.cover,item.title)}<span class="status ${item.progress===100?'done':''}">${item.progress===100?'已完成':item.progress?'进行中':'未开始'}</span></div><div class="course-body"><div class="classification">${esc(item.type)}<span>${esc(item.level)}</span></div><h2>${title}</h2><p>${desc}</p><p class="course-teacher">老师：${esc(item.teacher)}</p><div class="progress" role="progressbar" aria-label="${title}学习进度" aria-valuenow="${item.progress}" aria-valuemin="0" aria-valuemax="100"><i style="width:${item.progress}%"></i></div><div class="small-meta"><span>${esc(item.duration)}</span><span>${item.progress}%</span></div><div class="card-actions"><small>${esc(item.metrics)}</small><button class="button" data-learn="${id}">${item.progress?'继续学习':'开始学习'} ↗</button></div></div></article>`;
  if(item.kind==='case')return `<article class="case-card">${bookmark(item)}<button class="case-image" data-detail="${id}">${image(item.cover,item.title)}<span class="case-category">${esc(item.type)}</span></button><div class="case-body"><h2><button class="title-button" data-detail="${id}">${title}</button></h2><p>${desc}</p><div class="chips">${item.tags.map(t=>`<span class="chip">${esc(t)}</span>`).join('')}</div><div class="case-actions"><span class="metrics">${esc(item.metrics)}</span><button class="button purple" data-remix="${id}">Remix</button></div></div></article>`;
  return `<article class="tool-card">${bookmark(item)}<div class="tool-heading"><div class="tool-logo">${image(item.cover,item.title)}</div><h2><button class="title-button" data-detail="${id}">${title}</button></h2></div><span class="tool-category">${esc(item.type)}</span><p class="tool-desc">${desc}</p><div class="tool-bottom">${item.href?`<a class="button" href="${esc(item.href)}" target="_blank" rel="noopener noreferrer">打开工具 ↗</a>`:'<span>入口待配置</span>'}</div></article>`;
}
async function toggleFavorite(item) {
  if(item.kind==='case'){const response=await api(`/works/${encodeURIComponent(item.id)}/favorite`,{method:'POST'});item.favorited=response.active;item.favoriteCount=Math.max(0,(item.favoriteCount||0)+(response.active?1:-1));item.metrics=`${item.likeCount||0} 赞 · ${item.favoriteCount} 收藏`;}
  else { const type=item.kind==='course'?'course':'tool', list=ctx.state.get('favorites',[]), exists=saved(item);await ctx.state.set('favorites',exists?list.filter(f=>!(f.id===item.id&&f.type===type)):[...list,{type,id:item.id}]); }
  renderCatalog();toast(saved(item)?'已收藏到账号':'已取消收藏');
}
async function courseDetails(item, learn=false) {
  if(!ctx.learning.notes)ctx.learning=await api('/me/learning-space');
  let detail=await api('/courses/'+encodeURIComponent(item.id));
  if(learn&&!detail.enrollmentStatus)detail=await api(`/courses/${encodeURIComponent(item.id)}/enroll`,{method:'POST'});
  const notes=ctx.learning.notes||[],note=notes.find(n=>n.courseId===item.id);
  const d=modal(`<span class="eyebrow">${esc(item.type)}</span><h2 id="modal-title">${esc(item.title)}</h2><p>${esc(item.desc)}</p><div class="morph-links"><a href="/learning?course=${encodeURIComponent(item.id)}">完整课程与作业 ↗</a></div>${!detail.enrollmentStatus?'<button class="button" id="enroll">加入学习</button>':''}<h3>课程节点</h3>${detail.lessons.length?detail.lessons.map(l=>`<section class="morph-resource"><strong>${esc(l.title)}</strong><p>${esc(l.summary)}</p><small>${esc(l.completionCriteria)}</small><p>${l.progressPercent}% ${l.requiresWorkSubmission?'<a href="/learning?course='+encodeURIComponent(item.id)+'&lesson='+encodeURIComponent(l.id)+'">提交课时作业 ↗</a>':`<button class="button secondary" data-lesson-complete="${esc(l.id)}" ${l.progressPercent===100?'disabled':''}>${l.progressPercent===100?'已完成':'确认完成此节点'}</button>`}</p></section>`).join(''):'<p class="morph-empty">暂无教学节点</p>'}<h3>课件</h3>${detail.resources.map(r=>{const href=safeUrl(r.previewUrl||r.downloadUrl||r.externalUrl);return href?`<a class="morph-resource" target="_blank" rel="noopener noreferrer" href="${esc(href)}">${esc(r.title)} ↗</a>`:`<p>${esc(r.title)} · 选课后查看</p>`;}).join('')||'<p>暂无课件</p>'}<form class="morph-dialog-form" id="course-note"><label>学习笔记<textarea name="content" maxlength="6000" required>${esc(note?.content||'')}</textarea></label><button class="button">保存笔记</button></form>`);
  d.querySelector('#enroll')?.addEventListener('click',e=>busy(e.currentTarget,async()=>{await api(`/courses/${encodeURIComponent(item.id)}/enroll`,{method:'POST'});await courseDetails(item);toast('已加入学习');}).catch(()=>{}));
  d.querySelectorAll('[data-lesson-complete]').forEach(button=>button.onclick=()=>busy(button,async()=>{
    if(!confirm('确认已达到这个教学节点的完成标准？'))return;
    if(!detail.enrollmentStatus)await api(`/courses/${encodeURIComponent(item.id)}/enroll`,{method:'POST'});
    const result=await api(`/courses/${encodeURIComponent(item.id)}/lessons/${encodeURIComponent(button.dataset.lessonComplete)}/progress`,{method:'PUT',body:{progressPercent:100,completionConfirmed:true}});
    Object.assign(item,mapCourse(result));renderCatalog();await courseDetails(item);toast('学习进度已保存');
  }).catch(()=>{}));
  d.querySelector('#course-note').onsubmit=e=>{e.preventDefault();const form=e.currentTarget;void busy(form.querySelector('button'),async()=>{
    const existing=(ctx.learning.notes||[]).find(n=>n.courseId===item.id),content=form.elements.content.value.trim();
    const savedNote=await api('/me/learning-space/notes'+(existing?'/'+encodeURIComponent(existing.id):''),{method:existing?'PATCH':'POST',body:{title:item.title.slice(0,120),content,...(!existing?{courseId:item.id}:{})}});
    ctx.learning.notes=[...(ctx.learning.notes||[]).filter(n=>n.id!==savedNote.id),savedNote];toast('笔记已保存到账号');
  }).catch(()=>{});};
}
async function caseDetails(item) {
  const work=await api('/works/'+encodeURIComponent(item.id));
  const assets=(work.assets||[]).map(a=>{const href=safeUrl(a.downloadUrl||a.url);return href?`<a class="morph-resource" target="_blank" rel="noopener noreferrer" href="${esc(href)}">${esc(a.fileName||'查看素材')} ↗</a>`:'';}).join('');
  const d=modal(`${image(item.cover,item.title,'dialog-image')}<h2 id="modal-title">${esc(item.title)}</h2><p>${esc(item.desc)}</p><p>${esc((work.creators||[]).join('、')||work.author)}</p>${(work.story?.steps||[]).map(s=>`<h3>${esc(s.title)}</h3><p>${esc(s.description||s.content||'')}</p>`).join('')}${assets}<div class="morph-links"><a href="/community">完整案例与讨论 ↗</a></div><button class="button purple" id="case-remix">基于此案例创建 Remix 草稿</button>`);
  d.querySelector('#case-remix').onclick=()=>remix(item);
}
function remix(item) {
  const d=modal(`<span class="eyebrow">REMIX</span><h2 id="modal-title">从案例出发</h2><p>参考：${esc(item.title)}</p><form class="morph-dialog-form"><label>创作名称<input name="title" maxlength="120" value="${esc(item.title.slice(0,100)+' / 我的延展')}" required></label><label>创作方向<textarea name="brief" maxlength="6000" required></textarea></label><button class="button">保存草稿</button><p class="morph-form-error" role="alert"></p></form>`);
  d.querySelector('form').onsubmit=e=>{e.preventDefault();const form=e.currentTarget;void busy(form.querySelector('button'),async()=>{
    const draft={id:uid(),sourceCaseId:item.id,source:item.title,title:form.elements.title.value.trim(),brief:form.elements.brief.value.trim(),tools:item.tags||[],createdAt:new Date().toISOString()};await ctx.state.set('remixes',[draft,...ctx.state.get('remixes',[])]);toast('Remix 草稿已保存到账号');
    const content=d.querySelector('#dialog-content');content.innerHTML=`<h2 id="modal-title">${esc(draft.title)}</h2><p>${esc(draft.brief)}</p><a class="button" href="chat.html?remix=${encodeURIComponent(draft.id)}">带入创作空间 ↗</a><button class="button secondary" id="export-remix">下载 JSON</button>`;content.querySelector('#export-remix').onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(draft,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='morph-remix.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  }).catch(error=>form.querySelector('.morph-form-error').textContent=error.message);};
}
function recommendTool() {
  const d=modal('<h2 id="modal-title">推荐一个工具</h2><form class="morph-dialog-form"><label>工具名称<input name="title" maxlength="80" required></label><label>官网链接<input name="url" type="url" required></label><label>推荐理由<textarea name="reason" maxlength="3000" required></textarea></label><button class="button">保存推荐</button><p class="morph-form-error" role="alert"></p><p>推荐保存到你的账号，不会自动发布到公共目录。</p></form>');
  d.querySelector('form').onsubmit=e=>{e.preventDefault();const form=e.currentTarget;void busy(form.querySelector('button'),async()=>{const draft={id:uid(),title:form.elements.title.value.trim(),url:form.elements.url.value,reason:form.elements.reason.value.trim(),createdAt:new Date().toISOString()};await ctx.state.set('tool-submissions',[draft,...ctx.state.get('tool-submissions',[])]);d.close();toast('工具推荐已保存到账号');}).catch(error=>form.querySelector('.morph-form-error').textContent=error.message);};
}
function publishWork() {
  const d=modal('<h2 id="modal-title">保存我的作品</h2><form class="morph-dialog-form"><label>作品名称<input name="title" required minlength="2" maxlength="80"></label><label>作品分类<select name="type"><option>品牌设计</option><option>工业设计</option><option>交互设计</option><option>媒体艺术</option></select></label><label>作品封面<input name="cover" type="file" accept="image/png,image/jpeg,image/webp" required></label><label>作品介绍<textarea name="desc" minlength="2" maxlength="800" required></textarea></label><label>使用工具<input name="tags" maxlength="100"></label><p class="morph-form-error" role="alert"></p><button class="button">保存作品草稿</button><p>草稿上传到平台；补齐案例信息并通过审核后才会公开。</p></form>');
  let draftId;
  d.querySelector('form').onsubmit=e=>{e.preventDefault();const form=e.currentTarget;void busy(form.querySelector('button'),async()=>{
    const file=form.elements.cover.files[0];if(!file||file.size>2*1024*1024||!['image/png','image/jpeg','image/webp'].includes(file.type))throw new Error('请选择不超过2MB的PNG、JPG或WebP封面');
    const input={title:form.elements.title.value.trim(),summary:form.elements.desc.value.trim(),discipline:form.elements.type.value,tagNames:form.elements.tags.value.split(/[、,，]/).map(s=>s.trim()).filter(Boolean).slice(0,12)};
    const work=await api('/works'+(draftId?'/'+encodeURIComponent(draftId):''),{method:draftId?'PUT':'POST',body:input});draftId=work.id;
    const data=new FormData();data.append('file',file);await api(`/works/${encodeURIComponent(work.id)}/assets`,{method:'POST',body:data});
    toast('作品与封面已保存');d.querySelector('#dialog-content').innerHTML='<h2 id="modal-title">作品草稿已保存</h2><p>可在原案例编辑器补齐创作过程、授权信息并提交审核。</p><a class="button" href="/community">前往案例管理 ↗</a>';
  }).catch(error=>form.querySelector('.morph-form-error').textContent=error.message);};
}
export function initCatalog(page) {
  const data=page==='home'?[...ctx.courses,...ctx.cases]:page==='courses'?ctx.courses:page==='cases'?ctx.cases:ctx.tools;
  const grid=document.getElementById('grid'),filters=document.getElementById('filters'),search=document.getElementById(page==='home'?'gallery-search':'search');let category='',query='',savedOnly=false,status='all';
  renderCatalog=()=>{
    if(page==='home'){document.getElementById('home-courses').innerHTML=ctx.courses.map(card).join('')||'<p class="morph-empty">暂无已发布课程</p>';document.getElementById('home-cases').innerHTML=ctx.cases.slice(0,8).map(card).join('')||'<p class="morph-empty">暂无已发布案例</p>';return;}
    const categories=[...new Set(data.map(c=>c.type))];if(filters)filters.innerHTML=['',...categories].map(c=>`<button class="filter ${c===category?'selected':''}" data-category="${esc(c)}" aria-pressed="${c===category}">${esc(c||'全部')}<small>${data.filter(i=>!c||i.type===c).length}</small></button>`).join('');
    const visible=data.filter(item=>(!category||item.type===category)&&(!savedOnly||saved(item))&&JSON.stringify([item.title,item.desc,item.tags]).toLowerCase().includes(query.toLowerCase())&&(status==='all'||(status==='complete'?item.progress===100:item.progress>0&&item.progress<100)));
    grid.className=page==='cases'?'case-grid':page==='tools'?'tool-grid':'course-grid';grid.innerHTML=visible.map(card).join('')||'<p class="morph-empty">暂无符合条件的内容</p>';
  };
  filters?.addEventListener('click',event=>{const b=event.target.closest('[data-category]');if(b){category=b.dataset.category;renderCatalog();}});search?.addEventListener('input',event=>{query=event.target.value;renderCatalog();});
  document.getElementById('saved-only')?.addEventListener('click',event=>{savedOnly=!savedOnly;event.currentTarget.setAttribute('aria-pressed',String(savedOnly));renderCatalog();});
  document.querySelectorAll('[data-learning-status]').forEach(b=>b.onclick=()=>{status=b.dataset.learningStatus;document.querySelectorAll('[data-learning-status]').forEach(n=>n.setAttribute('aria-pressed',String(n===b)));renderCatalog();});
  document.querySelectorAll('[data-tag]').forEach(b=>b.onclick=()=>{query=b.dataset.tag;if(search)search.value=query;renderCatalog();});
  document.addEventListener('click',event=>{const b=event.target.closest('[data-save],[data-learn],[data-detail],[data-remix]');if(!b)return;const id=b.dataset.save||b.dataset.learn||b.dataset.detail||b.dataset.remix,item=data.find(i=>i.id===id);if(!item)return;
    void busy(b,async()=>{if(b.hasAttribute('data-save'))await toggleFavorite(item);else if(b.hasAttribute('data-remix'))remix(item);else if(item.kind==='course')await courseDetails(item,b.hasAttribute('data-learn'));else if(item.kind==='case')await caseDetails(item);else modal(`<h2 id="modal-title">${esc(item.title)}</h2><p>${esc(item.desc)}</p>${item.href?`<a class="button" href="${esc(item.href)}" target="_blank" rel="noopener noreferrer">打开工具 ↗</a>`:'<p>入口待配置</p>'}`);}).catch(()=>{});
  });
  document.getElementById('submit-tool')?.addEventListener('click',recommendTool);document.getElementById('submit-work')?.addEventListener('click',publishWork);
  const atom=document.querySelector('.atom-map');if(atom)atom.innerHTML=ctx.courses.slice(0,4).map((c,i)=>`<button class="${i?'':'atom-core'}" data-detail="${esc(c.id)}"><span>${esc(c.type)}</span><strong>${esc(c.title)}</strong><small>${esc(c.metrics)}</small></button>`).join('')||'<p class="morph-empty">课程资料尚未发布</p>';
  if(page==='tools'){const links=document.createElement('div');links.className='morph-launches';links.innerHTML='<a href="/studio">打开工作流与ComfyUI ↗</a>';grid.before(links);}
  renderCatalog();
  const selectedCourse=new URLSearchParams(location.search).get('course');const selected=data.find(c=>c.kind==='course'&&c.id===selectedCourse);if(selected)void courseDetails(selected).catch(error=>toast(error.message));
}
