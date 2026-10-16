import { api, esc, safeUrl, uid, executeStream } from './connected-api.js';
import { ctx, toast } from './connected.js';
const draftKey=()=>`morph:${ctx.actor.id}:draft`;
function getDraft(){try{return JSON.parse(sessionStorage.getItem(draftKey())||'{}');}catch{return {};}}
function setDraft(value){try{sessionStorage.setItem(draftKey(),JSON.stringify(value));}catch{throw new Error('浏览器暂时不能传递草稿，请在创作空间直接输入');}}
function models(mode){return (ctx.home.creation?.models||[]).filter(m=>(m.capabilities||[]).includes(mode));}
function modelOptions(mode,selected){const options=models(mode);return options.map(m=>`<option value="${esc(m.id)}" ${m.id===selected?'selected':''}>${esc(m.name||m.id)}</option>`).join('')||'<option value="">未配置可用模型</option>';}
export function initHome(){
  const form=document.getElementById('prompt-form');if(!form)return;const input=document.getElementById('prompt');input.value='';let mode='image',reference=null,uploading=false;
  const modelButton=document.getElementById('model'),menu=document.getElementById('model-menu'),label=document.getElementById('model-label');let selected='';
  function updateModels(){const list=models(mode);selected=list[0]?.id||'';label.textContent=list[0]?.name||'未配置模型';menu.innerHTML=list.map(m=>`<button role="option" type="button" data-model-id="${esc(m.id)}">${esc(m.name||m.id)}</button>`).join('')||'<p>请在后台配置模型</p>';menu.querySelectorAll('button').forEach(b=>b.onclick=()=>{selected=b.dataset.modelId;label.textContent=b.textContent;menu.hidden=true;modelButton.setAttribute('aria-expanded','false');});}
  updateModels();modelButton.onclick=()=>{menu.hidden=!menu.hidden;modelButton.setAttribute('aria-expanded',String(!menu.hidden));};
  document.querySelectorAll('.mode-tabs button').forEach(b=>b.onclick=()=>{mode=b.dataset.mode;document.querySelectorAll('.mode-tabs button').forEach(n=>n.setAttribute('aria-pressed',String(n===b)));updateModels();});
  const search=document.getElementById('search');search.onclick=()=>search.setAttribute('aria-pressed',String(search.getAttribute('aria-pressed')!=='true'));
  document.getElementById('attach').onclick=()=>document.getElementById('reference').click();document.getElementById('reference').onchange=async e=>{const file=e.target.files[0];if(!file)return;uploading=true;reference=null;const status=document.getElementById('file-status');status.textContent='正在上传参考文件…';try{const body=new FormData();body.append('file',file);reference=await api('/creation-files',{method:'POST',body});status.textContent='已上传参考：'+reference.fileName;}catch(error){status.textContent=error.message;}finally{uploading=false;}};
  document.getElementById('voice').onclick=()=>toast('语音服务尚未接入，请使用文字输入');
  form.onsubmit=e=>{e.preventDefault();if(uploading){toast('请等待参考文件上传完成');return;}const prompt=input.value.trim();if(!prompt){input.focus();return;}try{setDraft({prompt,mode,modelId:selected,searchEnabled:search.getAttribute('aria-pressed')==='true',reference});location.href='chat.html';}catch(error){toast(error.message);}};
  input.onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();form.requestSubmit();}};
  document.querySelectorAll('a[href="chat.html"]').forEach(a=>{if(a.textContent.includes('工作流'))a.href='/studio';});
}
export function initChat(){
  const form=document.getElementById('chat-compose'),input=document.getElementById('chat-prompt'),list=document.getElementById('conversation-list'),log=document.getElementById('chat-messages'),title=document.getElementById('conversation-title'),newButton=document.getElementById('new-conversation');
  const draft=getDraft();let records=ctx.state.get('creation-records',[]),current=records[0]?.id||null,controller=null,sending=false,uploading=false,reference=draft.reference||null;
  const empty=log.innerHTML;
  const options=document.createElement('div');options.className='morph-chat-options';options.innerHTML=`<label>模式<select name="mode"><option value="chat">对话</option><option value="image">生图</option></select></label><label>模型<select name="model"></select></label><label><input type="checkbox" name="search">智能搜索</label><label>参考文件<input type="file" name="reference"></label><button type="button" class="button secondary" id="remove-reference">移除参考</button><span id="chat-reference-name"></span>`;form.prepend(options);
  const mode=options.querySelector('[name=mode]'),model=options.querySelector('[name=model]'),search=options.querySelector('[name=search]'),fileInput=options.querySelector('[name=reference]'),fileName=options.querySelector('#chat-reference-name');
  mode.value=draft.mode==='image'?'image':'chat';function refreshModels(){model.innerHTML=modelOptions(mode.value,draft.modelId);search.disabled=mode.value!=='chat';}refreshModels();mode.onchange=refreshModels;search.checked=draft.searchEnabled===true;
  function renderReference(){fileName.textContent=reference?'参考：'+reference.fileName:'';}renderReference();options.querySelector('#remove-reference').onclick=()=>{reference=null;fileInput.value='';renderReference();};
  fileInput.onchange=async()=>{const file=fileInput.files[0];if(!file)return;uploading=true;fileInput.disabled=true;reference=null;renderReference();try{const body=new FormData();body.append('file',file);reference=await api('/creation-files',{method:'POST',body});renderReference();}catch(error){toast(error.message);}finally{uploading=false;fileInput.disabled=false;}};
  const sendButton=form.querySelector('button[type=submit]'),footer=form.querySelector(':scope > div:last-child > span');if(footer)footer.textContent='对话记录保存到当前账号';sendButton.textContent='发送 ↗';
  const stop=document.createElement('button');stop.id='morph-stop';stop.type='button';stop.className='button secondary';stop.textContent='停止输出';stop.hidden=true;sendButton.before(stop);stop.onclick=()=>controller?.abort();
  const service=document.querySelector('.service-status');service.textContent=ctx.home.creation?.enabled?'模型服务已连接':'模型服务未启用';
  const person=document.querySelector('.chat-person');if(person)person.textContent=(ctx.state.get('profile',{}).name||ctx.actor.displayName)+'的空间 ↗';
  function render(){list.innerHTML=records.map(r=>`<button type="button" class="conversation-item ${r.id===current?'active':''}" data-id="${esc(r.id)}" ${sending?'disabled':''}>${esc(r.title)}<small>${r.messages.length} 条消息</small></button>`).join('')||'<p class="conversation-empty">还没有创作记录</p>';const r=records.find(x=>x.id===current);title.textContent=r?.title||'从一个想法开始';log.innerHTML=r?r.messages.map(m=>`<div class="morph-message ${m.role}"><small>${m.role==='user'?'你':'AI'}</small><div>${esc(m.text)}</div></div>`).join(''):empty;
    // Downloads are only created for this platform's generated artifacts.
    log.querySelectorAll('.morph-message.assistant').forEach(n=>{const href=n.textContent.match(/\/api\/generation-jobs\/[a-zA-Z0-9_-]+\/download/)?.[0];if(href){const a=document.createElement('a');a.href=href;a.target='_blank';a.rel='noopener noreferrer';a.textContent='查看生成成果 ↗';n.append(a);}});log.scrollTop=log.scrollHeight;}
  list.onclick=e=>{if(sending)return;const b=e.target.closest('[data-id]');if(b){current=b.dataset.id;render();}};newButton.onclick=()=>{if(sending)return;current=null;input.value='';render();input.focus();};log.onclick=e=>{const b=e.target.closest('[data-suggestion]');if(b){input.value=b.dataset.suggestion;input.focus();}};
  async function persist(next){await ctx.state.set('creation-records',next);records=structuredClone(next);}
  function lock(value){sending=value;sendButton.disabled=value;newButton.disabled=value;stop.hidden=!value;options.querySelectorAll('input,select,button').forEach(n=>n.disabled=value);if(!value)search.disabled=mode.value!=='chat';}
  form.onsubmit=async e=>{
    e.preventDefault();if(sending)return;const text=input.value.trim();if(!text)return;
    if(uploading){toast('请等待参考文件上传完成');return;}
    if(mode.value==='image'&&reference){toast('当前生图接口支持文生图；请移除参考文件，或切换对话模式读取参考');return;}
    if(!ctx.home.creation?.enabled){toast('模型服务未启用，请先配置服务端模型');return;}
    if(!model.value && mode.value==='chat'){toast('请选择可用对话模型');return;}
    lock(true);controller=new AbortController();let next=structuredClone(records),conversation=next.find(r=>r.id===current),answer='',savedQuestion=false,runId;
    try{
      if(!conversation){conversation={id:uid(),title:text.slice(0,24),messages:[]};next.unshift(conversation);}const history=conversation.messages.slice(-20).map(m=>({role:m.role,content:m.text.slice(0,20000)}));conversation.messages.push({role:'user',text,at:new Date().toISOString()});await persist(next);savedQuestion=true;current=conversation.id;render();
      if(mode.value==='image'){
        const result=await api('/generation-jobs/run',{method:'POST',body:{jobType:'image',prompt:text,parameters:{source:'morph-v17',...(reference?{referenceFileId:reference.id}: {})},...(model.value?{modelConfigId:model.value}:{})},signal:controller.signal});runId=result.job?.id;answer=result.artifact?.downloadUrl?'生成完成。\n'+result.artifact.downloadUrl:result.output?.content||'生成完成';
      }else{
        const run=await api('/agent-runs',{method:'POST',body:{scenario:'chat',prompt:text,parameters:{source:'morph-v17',...(reference?{referenceFileId:reference.id}: {})}},signal:controller.signal});runId=run.id;
        const bubble=document.createElement('div');bubble.className='morph-message assistant';bubble.textContent='正在生成…';log.append(bubble);
        const result=await executeStream(run.id,{mode:'server',providerId:model.value,context:history,searchEnabled:search.checked,model:{toolChoice:'auto'}},delta=>{answer+=delta;bubble.textContent=answer;log.scrollTop=log.scrollHeight;},controller.signal);
        if(result.status!=='succeeded')throw new Error('生成任务未成功，请查看任务记录');answer=[...(result.messages||[])].reverse().find(m=>m.role==='agent')?.content||answer;if(!answer)throw new Error('模型没有返回内容');
      }
      next=structuredClone(records);conversation=next.find(r=>r.id===current);conversation.messages.push({role:'assistant',text:answer,at:new Date().toISOString(),...(runId?{runId}:{})});await persist(next);input.value='';try{sessionStorage.removeItem(draftKey());}catch{}render();
    }catch(error){
      const message=error.name==='AbortError'?'已停止输出':error.message;toast(message);
      // Keep both prompt and any generated response visible if persistence fails;
      // do not silently re-run a paid model request.
      input.value=text;if(savedQuestion&&answer){const n=document.createElement('div');n.className='morph-message assistant';n.textContent=answer;const retry=document.createElement('button');retry.type='button';retry.className='button secondary';retry.textContent='保存当前输出';retry.onclick=async()=>{retry.disabled=true;try{const copy=structuredClone(records),r=copy.find(c=>c.id===current);r.messages.push({role:'assistant',text:answer,at:new Date().toISOString(),...(runId?{runId}:{})});await persist(copy);render();toast('输出已保存');}catch(err){toast(err.message);retry.disabled=false;}};n.append(retry);log.append(n);}
    }finally{controller=null;lock(false);renderListOnly();}
  };
  function renderListOnly(){list.querySelectorAll('button').forEach(b=>b.disabled=false);}
  input.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();form.requestSubmit();}});
  render();if(draft.prompt)input.value=draft.prompt;const remixId=new URLSearchParams(location.search).get('remix'),remix=ctx.state.get('remixes',[]).find(r=>r.id===remixId);if(remix)input.value=`参考案例：${remix.source}\n创作名称：${remix.title}\n创作方向：${remix.brief}`;
}
