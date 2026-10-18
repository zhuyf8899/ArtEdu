/* Ring gallery interaction adapted from the supplied Ring3DGallery.
   Original Figma artwork and orbit positions remain the initial state. */
(()=>{
 const stage=document.querySelector('[data-node-id="382:1969"]');if(!stage)return;
 const ids=['2144','2104','2066','2027','1987','2008','2046','2085','2125'];
 const titles=['JULIAN PARK','PAPER MATRIX','RAINY STREET','AQUA PRISM','TITAN X-01','CHROMA POSTER','MINIMAX H3','SOFT TORUS','SPATIAL OLED'];
 const categories=['视觉摄影','概念艺术','三维渲染','空间交互','工业产品','品牌系统','版面工程','触感生成','空间UI'];
 const cards=ids.map(id=>stage.querySelector(`[data-node-id="382:${id}"]`));
 const slots=cards.map(e=>({x:parseFloat(e.style.left)+parseFloat(e.style.width)/2,y:parseFloat(e.style.top)+parseFloat(e.style.height)/2,w:parseFloat(e.style.width),h:parseFloat(e.style.height)}));
 const mod=v=>(v%9+9)%9;
 let position=0,target=0,frame=0,drag=null,moved=false,active=0;
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');
 const label=stage.querySelector('[data-node-id="382:1974"]');
 const badge=stage.querySelector('[data-node-id="382:1984"]');
 const category=stage.querySelector('[data-node-id="382:1986"]');
 function sample(t,key){const i=Math.floor(t),u=t-i,a=slots[mod(i-1)][key],b=slots[mod(i)][key],c=slots[mod(i+1)][key],d=slots[mod(i+2)][key];return .5*((2*b)+(-a+c)*u+(2*a-5*b+4*c-d)*u*u+(-a+3*b-3*c+d)*u*u*u)}
 function paint(){
  active=mod(Math.round(position));
  cards.forEach((e,i)=>{const s=mod(i-position),x=sample(s,'x'),y=sample(s,'y'),w=sample(s,'w'),h=sample(s,'h'),o=slots[i];
   e.style.transform=`translate(${x-o.x}px,${y-o.y}px) scale(${w/o.w},${h/o.h})`;
   e.style.zIndex=String(Math.round(y));const depth=Math.max(0,Math.min(1,(y-99)/521));e.style.opacity=String(.51+.49*depth);e.style.filter=`blur(${Math.max(0,1.88*(1-depth*2))}px)`;e.querySelectorAll('[style]').forEach(n=>{if(n.style.filter.includes('blur'))n.style.filter='none';if(n.style.opacity)n.style.opacity='1'});e.setAttribute('aria-pressed',String(i===active));
  });
  label.textContent=titles[active];label.style.fontSize=active===5?'32px':'40.743px';
  badge.textContent=`今日灵感 · ${String(active+1).padStart(2,'0')}`;category.textContent=categories[active];
 }
 function tick(){frame=0;if(!drag){const delta=target-position;position=Math.abs(delta)<.001?target:position+delta*.13;paint();if(position!==target)frame=requestAnimationFrame(tick)}}
 function go(value){target=value;if(reduced.matches){position=target;paint()}else if(!frame)frame=requestAnimationFrame(tick)}
 cards.forEach((e,i)=>{e.style.transformOrigin='center';e.style.cursor='grab';e.setAttribute('role','button');e.setAttribute('tabindex','0');e.setAttribute('aria-label',`旋转展示 ${titles[i]}`);e.setAttribute('aria-pressed',String(i===0));
  e.addEventListener('click',ev=>{if(ev.detail||moved)return;let delta=mod(i-position);if(delta>4.5)delta-=9;go(position+delta)});
  e.addEventListener('keydown',ev=>{if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();e.click()}});
 });
 stage.style.touchAction='pan-y';stage.style.userSelect='none';stage.style.cursor='grab';stage.setAttribute('aria-label','今日灵感环形画廊，可左右拖动或使用方向键旋转');stage.tabIndex=0;
 stage.addEventListener('dragstart',e=>e.preventDefault());
 stage.addEventListener('pointerdown',e=>{if(e.button!==0)return;moved=false;drag={x:e.clientX,position,id:e.pointerId,card:cards.findIndex(c=>c.contains(e.target))};cancelAnimationFrame(frame);frame=0});
 stage.addEventListener('pointermove',e=>{if(!drag||e.pointerId!==drag.id)return;const scale=stage.getBoundingClientRect().width/stage.offsetWidth,dx=(e.clientX-drag.x)/scale;if(Math.abs(dx)>4){moved=true;stage.setPointerCapture(e.pointerId)}if(moved){position=drag.position-dx*.35/40;target=position;paint()}});
 function release(e){if(!drag||e.pointerId!==drag.id)return;const card=drag.card;drag=null;if(!moved&&card>=0){let delta=mod(card-position);if(delta>4.5)delta-=9;go(position+delta)}else go(Math.round(position))}
 stage.addEventListener('pointerup',release);stage.addEventListener('pointercancel',release);
 stage.addEventListener('keydown',e=>{if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();go(Math.round(target)+(e.key==='ArrowRight'?1:-1))}});
 document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(frame);frame=0;position=target;paint()}});
})();
