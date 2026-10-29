import { mountQuality, frameBudget } from './displayQuality.js';
export function mountMorphCosmos(root) { return mountQuality(root, mountEffect); }
function mountEffect(root, quality) {
const reportFrame = frameBudget(quality);
const controller = new AbortController();
const listen = (target, type, handler) => target.addEventListener(type, handler, {signal:controller.signal});
const byId = id => root.querySelector('#' + id);
const hero=root,canvas=byId('universe'),ctx=canvas.getContext('2d'),dust=byId('word-dust'),dc=dust.getContext('2d');
const reduced=matchMedia('(prefers-reduced-motion: reduce)');let W=0,H=0,dpr=1,particles=[],stars=[],raf=0,last=0,time=0,paused=reduced.matches||!quality.fps,visible=true,morph=0,target=0,manualUntil=0,pointer={x:0,y:0},mouse={x:0,y:0};
let seed=3862238;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296};const mix=(a,b,t)=>a+(b-a)*t;const smooth=x=>x*x*(3-2*x);const TAU=Math.PI*2;
const palette=['180,193,255','210,203,255','137,176,255','242,210,209','245,168,111'];
// Pre-render soft circles once, instead of applying expensive per-particle blur.
const sprites=palette.map(c=>{const s=document.createElement('canvas');s.width=s.height=48;const g=s.getContext('2d'),r=g.createRadialGradient(24,24,0,24,24,24);r.addColorStop(0,`rgba(${c},.85)`);r.addColorStop(.13,`rgba(${c},.5)`);r.addColorStop(.4,`rgba(${c},.16)`);r.addColorStop(1,`rgba(${c},0)`);g.fillStyle=r;g.fillRect(0,0,48,48);return s});
function populate(){seed=3862238;particles=[];stars=[];const count=Math.round((W<700?3600:8500)*quality.scale);
 for(let i=0;i<count;i++){const angle=random()*TAU,r=Math.pow(random(),.57),arm=i%3,spin=angle*.19+r*7.4+arm*TAU/3,spread=(random()-.5)*(.05+r*.18);const gx=Math.cos(spin)*r*.48+spread,gy=Math.sin(spin)*r*.24+spread*.55;let ex,ey;
 if(i%10<4){const u=random()*2-1,side=random()>.5?1:-1;ex=u*.48;ey=side*.205*Math.pow(Math.max(0,1-u*u),.78)+(random()-.5)*.019;}
 else{const a=random()*TAU,ir=.070+Math.pow(random(),.7)*.112,ridge=Math.sin(a*73)*.007;ex=Math.cos(a)*(ir+ridge);ey=Math.sin(a)*(ir+ridge);}
 particles.push({gx,gy,ex,ey,z:random()*2-1,size:.3+random()*.9,phase:random()*TAU,speed:.5+random(),color:random()<.15?4:Math.floor(random()*4),drift:random(),ambient:i%17===0});}
 for(let i=0;i<Math.round((W<700?300:850)*quality.scale);i++)stars.push({x:random(),y:random(),z:random(),p:random()*TAU,size:random()});
}
const words=[...root.querySelectorAll('.floating-words span')],vocabulary=['灵感的引力','无界的想象','思维的星系','创意的涌现','算法的诗意','感知的边界','智能共生','生成未来','设计的可能','艺术与科技','想象的轨迹','灵感生长','BEYOND FORM','CREATIVE GRAVITY','ART × AI','DESIGN FUTURES','GENERATIVE VISIONS','HUMAN × MACHINE','INFINITE IDEAS','POETIC COMPUTATION','PERCEPTION','IMAGINATION'];let wordMaps=[];
function setupWords(){wordMaps=words.map((el,i)=>({el,angle:Math.random()*TAU,r:.2+Math.random()*.33,z:Math.random()*.45-.22,offset:Math.random()*16,period:10+Math.random()*8,index:-1}));}
const headline=[['让创意生长于','艺术与智能之间'],['从一个想法开始','探索艺术与科技的更多可能']];
function drawWords(){dc.clearRect(0,0,W,H);for(let i=0;i<wordMaps.length;i++){const p=wordMaps[i],life=(time+p.offset)/p.period,cycle=Math.floor(life),phase=life-cycle;if(p.index!==cycle){p.el.textContent=vocabulary[Math.floor(Math.random()*vocabulary.length)];p.index=cycle;}const angle=p.angle+time*mix(.035,.12,morph),ox=Math.cos(angle)*p.r,oy=Math.sin(angle)*p.r*.5,oz=p.z,ca=Math.cos(time*.085),sa=Math.sin(time*.085),ct=Math.cos(.38),st=Math.sin(.38),rx=ox*ca+oz*sa,rz=-ox*sa+oz*ca,ry=oy*ct-rz*st,z=oy*st+rz*ct,scale=W<700?W*1.1:W*.73,proj=1/(1+z*.95),x=W*.54+mix(rx,ox,morph)*scale*proj,y=H*.415+mix(ry,oy,morph)*scale*proj;const opacity=Math.min(1,phase/.18,(1-phase)/.22);const avoidTitle=x<W*.45&&y>H*.22&&y<H*.5;const inBounds=x>W*.06&&x<W*.88&&y>H*.13&&y<H*.65;p.el.style.opacity=String(avoidTitle||!inBounds?0:opacity*.58);p.el.style.filter=`blur(${Math.max(0,z+.12)*3}px)`;p.el.style.transform=`translate(${x}px,${y}px)`;}
const cycle=time/10,idx=Math.floor(cycle)%2,phase=cycle%1,lines=headline[(reduced.matches||!quality.fps)?0:idx],total=lines.join('').length,progress=(reduced.matches||!quality.fps)?1:Math.min(1,phase/.1),chars=Math.floor(total*progress);byId('hero-title').style.opacity=String((reduced.matches||!quality.fps)?1:phase<.78?1:Math.max(0,(1-phase)/.22));byId('title-line-1').textContent=lines[0].slice(0,chars);byId('title-line-2').textContent=lines[1].slice(0,Math.max(0,chars-lines[0].length));}

function resize(){const r=hero.getBoundingClientRect();W=r.width;H=r.height;dpr=Math.min(devicePixelRatio||1,quality.dpr);for(const c of [canvas,dust]){c.width=Math.round(W*dpr);c.height=Math.round(H*dpr);}ctx.setTransform(dpr,0,0,dpr,0,0);dc.setTransform(dpr,0,0,dpr,0,0);hero.style.setProperty('--glow-scale',Math.min(W/1920,1));populate();setupWords();root.querySelectorAll('[data-name="课程封面"],[data-name="封面 / COL-01"]').forEach(e=>e.style.setProperty('--cover-scale',e.clientWidth/180));paint(0);}
function paint(dt){mouse.x=mix(mouse.x,pointer.x,.035);mouse.y=mix(mouse.y,pointer.y,.035);morph=mix(morph,target,dt?1-Math.exp(-dt*.48):0);ctx.clearRect(0,0,W,H);ctx.globalCompositeOperation='lighter';
 for(const s of stars){const x=((s.x*W+Math.sin(time*.03+s.p)*14+mouse.x*s.z*16)%W+W)%W,y=s.y*H+Math.cos(time*.04+s.p)*7+mouse.y*s.z*10;ctx.fillStyle=`rgba(217,221,255,${(.13+.2*(.5+.5*Math.sin(time*.6+s.p)))*(1-s.z*.5)})`;ctx.fillRect(x,y,.45+s.size,.45+s.size);}
 const scale=W<700?W*1.35:W*.73,cx=W*(W<700?.57:.54),cy=H*(W<700?.385:.415);
 // Rotate a volumetric star field, then project it through a moving focal plane.
 const yaw=time*.085,roll=time*.035,tilt=.38+Math.sin(time*.055)*.22;
 const ca=Math.cos(yaw),sa=Math.sin(yaw),cr=Math.cos(roll),sr=Math.sin(roll),ct=Math.cos(tilt),st=Math.sin(tilt);

 for(const p of particles){
  const orbit=time*.035*(.65+p.drift*.55),co=Math.cos(orbit),so=Math.sin(orbit);
  const ox=p.gx*co-p.gy*so,oy=p.gx*so+p.gy*co,oz=p.z*.22;
  const rx=ox*ca+oz*sa,rz=-ox*sa+oz*ca;
  const ry=oy*ct-rz*st,gz=oy*st+rz*ct;
  const gx=rx*cr-ry*sr,gy=rx*sr+ry*cr;
  // The eye remains legible while its iris and surrounding dust keep moving.
  const eyeTurn=time*.12,ec=Math.cos(eyeTurn),es=Math.sin(eyeTurn);
  const iris=Math.hypot(p.ex,p.ey)<.20;
  const ex=iris?p.ex*ec-p.ey*es:p.ex,ey=iris?p.ex*es+p.ey*ec:p.ey;
  let x=mix(gx,ex,morph),y=mix(gy,ey,morph);
  const z=mix(gz,p.z*.10+Math.sin(time*.17+p.phase)*.065,morph);
  const projection=1/(1+z*.95);
  x+=Math.sin(time*.15+p.phase)*.003;y+=Math.cos(time*.12+p.phase)*.003;
  if(p.ambient){x=mix(x,gx*1.8,.6);y=mix(y,gy*1.8,.6);}
  const px=cx+x*scale*projection+mouse.x*(14+z*55),py=cy+y*scale*projection+mouse.y*(8+z*40);
  const depth=Math.min(1,Math.max(0,(z+.36)/.72)),blur=smooth(depth);
  const twinkle=.75+.25*Math.sin(time*p.speed*.5+p.phase),alpha=Math.min(1,(.38+p.size*.38+morph*.16)*twinkle)*(1-depth*.45);
  const radius=p.size*(W<700?.9:1.2)*projection;
  // Crossfade the crisp core and soft bokeh continuously, without a focus pop.
  if(blur<.995){ctx.globalAlpha=alpha*(1-blur);ctx.fillStyle=`rgb(${palette[p.color]})`;ctx.fillRect(px-radius/2,py-radius/2,radius,radius);}
  if(blur>.005||p.ambient){const size=(3+blur*23+(p.ambient?7:0))*projection;ctx.globalAlpha=alpha*(.13+blur*.5);ctx.drawImage(sprites[p.color],px-size/2,py-size/2,size,size);}
 }
ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';drawWords();}
function tick(now){raf=0;if(last && now-last < 1000/quality.fps-1){raf=requestAnimationFrame(tick);return;}if(paused||document.hidden||!visible){last=0;return;}const dt=last?Math.min((now-last)/1000,.05):0;last=now;time+=dt;const started=performance.now();paint(dt);reportFrame(performance.now()-started);raf=requestAnimationFrame(tick);}
function sync(){cancelAnimationFrame(raf);raf=0;last=0;if(!paused&&!document.hidden&&visible)raf=requestAnimationFrame(tick);}
listen(hero,'pointermove',e=>{const r=hero.getBoundingClientRect();pointer.x=(e.clientX-r.left)/W-.5;pointer.y=(e.clientY-r.top)/H-.5;});listen(hero,'pointerleave',()=>{pointer.x=pointer.y=0});
byId('scene-next').onclick=()=>{target=target===0?1:0;manualUntil=time+19;if(paused){morph=target;paint(0)}};listen(document,'visibilitychange',sync);const observer = new IntersectionObserver(([e])=>{visible=e.isIntersecting;sync()},{threshold:.02});observer.observe(hero);listen(reduced,'change',e=>{paused=e.matches||!quality.fps;sync();paint(0)});let resizeTimer;listen(window,'resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(resize,120)});

resize();sync();
return () => { controller.abort(); observer.disconnect(); clearTimeout(resizeTimer); cancelAnimationFrame(raf); byId('scene-next').onclick = null; };
}
