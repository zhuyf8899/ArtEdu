import { api, WorkspaceState, mapCourse, mapWork, mapTool, allWorks, esc } from './connected-api.js';
export const ctx = { actor:null, state:null, courses:[], cases:[], tools:[], home:{}, learning:{}, mine:[] };
let toastTimer;
export function toast(message) { let node=document.getElementById('toast');if(!node){node=document.createElement('div');node.id='toast';node.className='toast';node.role='status';document.body.append(node);}node.textContent=message;node.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>node.classList.remove('show'),5000); }
export function modal(html) {
  let dialog=document.getElementById('detail-dialog');
  if(!dialog){dialog=document.createElement('dialog');dialog.id='detail-dialog';dialog.className='dialog';dialog.innerHTML='<button class="dialog-close" aria-label="关闭详情">×</button><div class="dialog-content" id="dialog-content"></div>';document.body.append(dialog);}
  if(dialog.open)dialog.close();const previous=document.activeElement;dialog.querySelector('#dialog-content').innerHTML=html;
  dialog.querySelector('.dialog-close').onclick=()=>dialog.close();dialog.onclose=()=>previous?.isConnected&&previous.focus();dialog.showModal();return dialog;
}
export async function busy(button, work) { if(button.disabled)return;button.disabled=true;try{return await work();}catch(error){toast(error.message);throw error;}finally{button.disabled=false;} }
async function gate() {
  let panel=document.querySelector('.morph-gate');if(!panel){panel=document.createElement('div');panel.className='morph-gate';document.body.append(panel);}
  document.documentElement.classList.add('morph-loading');
  panel.innerHTML='<form><span class="eyebrow">MORPH LAB</span><h1>登录你的空间</h1><label>账号<input name="username" autocomplete="username" required></label><label>密码<input name="password" type="password" autocomplete="current-password" required></label><p class="morph-error" role="alert"></p><button class="button">登录</button></form>';
  return new Promise(resolve=>{panel.querySelector('form').onsubmit=async event=>{event.preventDefault();const form=event.currentTarget,button=form.querySelector('button');button.disabled=true;try{const actor=await api('/auth/login',{method:'POST',body:{username:form.elements.username.value,password:form.elements.password.value}});form.reset();panel.remove();resolve(actor);}catch(error){form.querySelector('.morph-error').textContent=error.message;}finally{button.disabled=false;}};});
}
let expired=false;
document.addEventListener('morph-session-expired',()=>{if(!ctx.actor||expired)return;expired=true;ctx.actor=null;ctx.state=null;gate().then(()=>location.reload());});
function account() {
  const profile=ctx.state.get('profile',{}),name=profile.name||ctx.actor.displayName;
  document.querySelectorAll('.account-name').forEach(n=>n.textContent=name);document.querySelectorAll('.account-trigger .avatar').forEach(n=>n.textContent=name.slice(0,1));
  const trigger=document.querySelector('.account-trigger');if(!trigger)return;
  trigger.onclick=async event=>{event.preventDefault();try{if(!ctx.home.creation)ctx.home=await api('/portal/home');}catch(error){toast(error.message);return;}const quota=ctx.home.creation?.quota||{},currentName=ctx.state.get('profile',{}).name||ctx.actor.displayName;const dialog=modal(`<h2 id="modal-title">${esc(currentName)}</h2><p>${esc(ctx.actor.username)}</p><p>今日使用 ${esc(quota.dailyUsed ?? 0)} / ${esc(quota.dailyLimit ?? '未设置')} 次</p><div class="morph-links"><a href="profile.html">我的空间</a><a href="/my-learning?atlas=knowledge">知识图谱</a><a href="/studio">工作流</a>${ctx.actor.roles.some(r=>['admin','teacher','operator'].includes(r))?'<a href="/admin">管理后台</a>':''}</div><button class="button secondary" id="morph-logout">退出登录</button>`);dialog.querySelector('#morph-logout').onclick=()=>busy(dialog.querySelector('#morph-logout'),async()=>{await api('/auth/logout',{method:'POST'});location.reload();}).catch(()=>{});};
}
async function main() {
  try {
    try{ctx.actor=await api('/auth/me');}catch(error){if(error.status!==401)throw error;ctx.actor=await gate();}
    const page=document.body.dataset.page,space=document.body.dataset.space;
    const [state,home,learning,courses,cases,tools,mine]=await Promise.all([
      api('/me/morph-state'),page==='home'||space==='chat'||space==='profile'?api('/portal/home'):Promise.resolve({}),space==='profile'?api('/me/learning-space'):Promise.resolve({}),
      space!=='profile'&&(page==='courses'||page==='home'||space==='curriculum')?api('/courses'):Promise.resolve({items:[]}),
      page==='home'||page==='cases'?allWorks():Promise.resolve([]),page==='tools'?api('/tool-directory-links'):Promise.resolve({items:[]}),space==='profile'?api('/me/works'):Promise.resolve({items:[]})
    ]);
    ctx.state=new WorkspaceState(state.states);ctx.home=home;ctx.learning=learning;ctx.mine=mine.items||[];
    ctx.courses=(space==='profile'?learning.courses:courses.items).map(mapCourse);ctx.cases=cases.map(mapWork);ctx.tools=tools.items.map(mapTool);
    account();
    if(space==='profile') await (await import('./connected-profile.js')).initProfile();
    if(document.getElementById('grid')) (await import('./connected-catalog.js')).initCatalog(page);
    if(document.getElementById('curriculum-form') || document.getElementById('saved-curriculum')) (await import('./connected-curriculum.js')).initCurriculum();
    if(space==='chat') (await import('./connected-chat.js')).initChat();
    if(page==='home') (await import('./connected-chat.js')).initHome();
    // Preserve the original artwork and Canvas effects; business scripts are replaced.
    for(const tag of document.querySelectorAll('script[data-visual-src]')) {const script=document.createElement('script');script.src=tag.dataset.visualSrc;document.body.append(script);}
    document.documentElement.classList.remove('morph-loading');
  }catch(error){document.documentElement.classList.remove('morph-loading');const panel=document.createElement('section');panel.className='morph-failed-start';panel.innerHTML=`<h1>暂时无法加载空间</h1><p>${esc(error.message)}</p><button class="button">重新加载</button><a href="/">返回原平台</a>`;panel.querySelector('button').onclick=()=>location.reload();document.body.append(panel);}
}
void main();
