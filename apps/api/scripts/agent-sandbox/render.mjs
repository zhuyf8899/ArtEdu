export const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
export function renderView(view,{resolvePreview=null}={}){
  return `<section class="outcome"><span class="badge ${esc(view.status)}">${esc(view.statusLabel)}</span><p>${esc(view.summary)}</p></section>
  <section class="artifacts"><h3>成果</h3>${view.artifacts.length?view.artifacts.map(a=>{
    const href=a.href&&(resolvePreview?resolvePreview(a):a.href);
    const validation=a.kind==='image'?(a.validation==='pass'?'独立视觉复核通过':a.validation==='visual_failed'?'视觉要求未满足':'图片已生成，等待视觉复核'):a.validation==='pass'?'最新版本检查通过':a.validation==='not_applicable'?'文件已生成':'尚未通过最新检查';
    return `<article class="artifact"><strong>${esc(a.label)}</strong><small>${esc(validation)}</small>${href&&a.canPreview?`<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">打开成果 ↗</a>`:'<span>待验证后预览</span>'}</article>`;
  }).join(''):'<p class="muted">没有可交付文件</p>'}</section>
  <section><h3>执行记录</h3><ol class="steps">${view.progress.map(e=>`<li><div><b>${esc(e.label)}</b><span class="badge ${esc(e.status)}">${esc(e.statusLabel)}</span></div><small>${esc(e.phase)}${e.endedAt?' · 已结束':' · 等待结束'}</small></li>`).join('')}</ol></section>`;
}
