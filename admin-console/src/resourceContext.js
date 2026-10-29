// Return targets are restricted to known local portal routes; never accept an external URL.
const positions=new Map();
export function safeReturnTarget(value) {
  if (typeof value !== 'string' || value.length>2000 || !/^\/(learning|my-learning|community|studio|curriculum|search)(?:[?#]|$)/.test(value) || /[\u0000-\u0020]/.test(value)) return '';
  try { const url = new URL(value, 'http://local'); return url.origin === 'http://local' ? url.pathname + url.search + url.hash : ''; } catch { return ''; }
}
export function withReturnTarget(target, from = window.location.pathname + window.location.search) {
  const safe = safeReturnTarget(from);
  if(safe){positions.set(safe,window.scrollY);if(positions.size>60)positions.delete(positions.keys().next().value);}
  return safe ? target + (target.includes('?') ? '&' : '?') + 'returnTo=' + encodeURIComponent(safe) : target;
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
  const learning=to.startsWith('/learning')?new URL(to,'http://local').searchParams:null;
  const learningLabel=learning?.has('course')?'返回本课程':({atoms:'返回学习原子',courses:'返回完整课程',legacy:'返回完整课程',mine:'返回我的贡献',learning:'返回原子学习记录',review:'返回内容审核',grading:'返回练习评价'}[learning?.get('library')]||'返回学习原子');
  const label = to.startsWith('/my-learning') ? (to.includes('favorites') ? '返回收藏案例' : to.includes('works') ? '返回我的作品' : '返回我的空间') : to.startsWith('/community') ? '返回案例社区' : to.startsWith('/search') ? '返回搜索结果' : learning ? learningLabel : to.startsWith('/studio') ? '返回技能工具' : to.startsWith('/curriculum') ? '返回学习路径' : '返回完整课程';
  return { to, label };
}
