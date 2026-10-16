export const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function safeUrl(value, fallback = '') {
  if (!value) return fallback;
  try { const url = new URL(value, 'http://platform.local'); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? value : fallback; } catch { return fallback; }
}
export function uid() {
  const bytes = new Uint8Array(16); crypto.getRandomValues(bytes);
  return Array.from(bytes, x => x.toString(16).padStart(2, '0')).join('');
}
export async function api(path, { method = 'GET', body, signal } = {}) {
  let response;
  try { response = await fetch('/api' + path, { method, credentials: 'include', headers: body === undefined || body instanceof FormData ? {} : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body), signal }); }
  catch (error) { if(error.name === 'AbortError') throw error; throw new Error('无法连接服务，请稍后重试'); }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(Array.isArray(data.message) ? data.message.join('；') : data.message || `请求失败（${response.status}）`);
    error.status = response.status;
    if (response.status === 401) document.dispatchEvent(new Event('morph-session-expired'));
    throw error;
  }
  return data;
}
export class WorkspaceState {
  constructor(states = {}, request = api) { this.states = states; this.request = request; this.queues = new Map(); }
  get(key, fallback) { return structuredClone(this.states[key]?.value ?? fallback); }
  async set(key, value) {
    const snapshot = structuredClone(value);
    const previous = this.queues.get(key) ?? Promise.resolve();
    const write = previous.catch(() => {}).then(async () => {
      const saved = await this.request('/me/morph-state/' + encodeURIComponent(key), { method: 'PUT', body: { version: this.states[key]?.version ?? 0, value: snapshot } });
      this.states[key] = saved;
      return this.get(key, null);
    });
    this.queues.set(key, write);
    return write;
  }
}
export function mapCourse(c) {
  return { ...c, kind:'course', code:c.slug || c.id, desc:c.summary || '', cover:safeUrl(c.coverImageUrl || c.coverUrl), type:c.category || '未分类', group:c.category || '未分类', level:({beginner:'入门',intermediate:'进阶',advanced:'高级'})[c.difficulty] || c.difficulty || '', duration:`${c.estimatedMinutes || 0} 分钟`, progress:c.progressPercent || 0, teacher:c.creatorName || '教师待补充', metrics:`${c.lessonCount || 0} 个课时`, tags:c.knowledgePoints || [] };
}
export function mapWork(w) {
  return { ...w, kind:'case', desc:w.summary || '', type:w.discipline || '未分类', cover:safeUrl(w.previewUrl), tags:[...new Set([...(w.tags || []).map(t => typeof t === 'string' ? t : t.name), ...(w.tools || [])])].filter(Boolean), metrics:`${w.likeCount || 0} 赞 · ${w.favoriteCount || 0} 收藏` };
}
export function mapTool(t) {
  return { ...t, kind:'tool', title:t.name, desc:t.detail || '', type:t.category || '未分类', cover:safeUrl(t.coverImageUrl), href:safeUrl(t.href), tags:[] };
}
export async function allWorks() {
  const items = [];
  for(let page=1;;page++) { const result = await api(`/works?pageSize=50&page=${page}`); items.push(...result.items); if(result.items.length < 50) return items; }
}
export async function executeStream(runId, input, onDelta, signal) {
  const response = await fetch(`/api/agent-runs/${encodeURIComponent(runId)}/execute-stream`, { method:'POST', credentials:'include', headers:{'Content-Type':'application/json',Accept:'text/event-stream'}, body:JSON.stringify(input), signal });
  if(!response.ok) { const data=await response.json().catch(()=>({})); throw new Error(data.message || '生成请求失败'); }
  if(!response.body || !response.headers.get('content-type')?.includes('text/event-stream')) throw new Error('服务未返回流式结果，请检查任务记录后重试');
  const reader=response.body.getReader(), decoder=new TextDecoder(); let buffer='', completed;
  try { for(;;) { const {value,done}=await reader.read(); if(done)break; buffer+=decoder.decode(value,{stream:true}); buffer=buffer.replace(/\r\n/g,'\n'); let boundary;
    while((boundary=buffer.indexOf('\n\n'))!==-1) { const frame=buffer.slice(0,boundary);buffer=buffer.slice(boundary+2);const type=/^event:\s*(.+)$/m.exec(frame)?.[1]?.trim(); const raw=frame.split('\n').filter(l=>l.startsWith('data:')).map(l=>l.slice(5).trim()).join('\n'); if(!raw)continue;const data=JSON.parse(raw);if(type==='delta')onDelta(data.text || '');else if(type==='done')completed=data.run;else if(type==='error')throw new Error(data.message || '生成失败'); }
  }} finally { reader.releaseLock(); }
  if(!completed)throw new Error('生成连接中断，未收到完成结果');return completed;
}
