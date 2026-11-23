// Return targets are restricted to known local portal routes; never accept an external URL.
const positions=new Map();
const labelFor = (labels, key, fallback) => Object.hasOwn(labels, key) ? labels[key] : fallback;
export function safeReturnTarget(value) {
  if (typeof value !== 'string' || value.length>2000 || !/^\/(?:learning|my-learning|community|studio|curriculum|search)?(?:[?#]|$)/.test(value) || /[\u0000-\u0020]/.test(value)) return '';
  try { const url = new URL(value, 'http://local'); return url.origin === 'http://local' ? url.pathname + url.search + url.hash : ''; } catch { return ''; }
}
export function withReturnTarget(target, from = window.location.pathname + window.location.search) {
  const safe = safeReturnTarget(from);
  if (!safe || safe === target) return target;
  const url = new URL(target, 'http://local');
  if (url.origin !== 'http://local' || url.searchParams.has('returnTo')) return target;
  if (safe === window.location.pathname + window.location.search) {
    positions.set(safe, window.scrollY);
    if (positions.size>60) positions.delete(positions.keys().next().value);
  }
  return url.pathname + url.search + (url.search ? '&' : '?') + 'returnTo=' + encodeURIComponent(safe) + url.hash;
}
export function restoreResourceScroll(route){
 const top=positions.get(route);if(top===undefined)return;
 const restore=()=>{window.scrollTo({top,behavior:'auto'});if(Math.abs(window.scrollY-top)<2)observer.disconnect();};
 const observer=new MutationObserver(restore);observer.observe(document.body,{childList:true,subtree:true});
 requestAnimationFrame(restore);const timer=setTimeout(()=>{restore();observer.disconnect();},10000);
 return ()=>{clearTimeout(timer);observer.disconnect();};
}
export function returnContext(search = window.location.search) {
  const to = safeReturnTarget(new URLSearchParams(search).get('returnTo'));
  const destination = to ? new URL(to, 'http://local') : null;
  const params = destination?.searchParams;
  const library = params?.get('library');
  const learningLabel=params?.has('course')||params?.has('node')&&library==='courses'?'返回本课程':params?.has('node')?'返回本原子':labelFor({atoms:'返回学习原子',courses:'返回完整课程',legacy:'返回完整课程',mine:'返回我的贡献',learning:'返回原子学习记录',review:'返回内容审核',grading:'返回练习评价'}, library, '返回学习原子');
  const label = {
    '/': '返回首页',
    '/my-learning': labelFor({favorites:'返回收藏案例',works:'返回我的作品',courses:'返回我的课程',notes:'返回学习笔记',plan:'返回学习计划'}, params?.get('view'), '返回我的空间'),
    '/community': params?.has('work') ? '返回案例详情' : '返回案例社区',
    '/search': '返回搜索结果',
    '/learning': learningLabel,
    '/studio': params?.get('view')==='workflows' ? '返回工作流目录' : '返回技能工具',
    '/curriculum': '返回学习路径',
  }[destination?.pathname] || '返回完整课程';
  return { to, label };
}
