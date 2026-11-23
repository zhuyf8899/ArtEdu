import { mountQuality, frameBudget } from './displayQuality.js';
export function mountMorphCosmos(root) { return mountQuality(root, mountEffect); }
function mountEffect(root, quality) {
const reportFrame = frameBudget(quality);
const controller = new AbortController();
const listen = (target, type, handler) => target.addEventListener(type, handler, {signal:controller.signal});
const byId = id => root.querySelector('#' + id);
const hero=root,canvas=byId('universe'),ctx=canvas.getContext('2d'),dust=byId('word-dust'),dc=dust.getContext('2d');
if (!ctx || !dc) return;
let W=0,H=0,dpr=1,particles=[],stars=[],raf=0,last=0,time=0,visible=true;
const paused = !quality.fps;
const pointer={x:0,y:0},mouse={x:0,y:0};
let seed=3862238;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296};const mix=(a,b,t)=>a+(b-a)*t;const smooth=x=>x*x*(3-2*x);const TAU=Math.PI*2;
const palette=['180,193,255','210,203,255','137,176,255','242,210,209','245,168,111','216,248,69'];
// Pre-render soft circles once, instead of applying expensive per-particle blur.
const sprites=palette.map(c=>{const s=document.createElement('canvas');s.width=s.height=48;const g=s.getContext('2d'),r=g.createRadialGradient(24,24,0,24,24,24);r.addColorStop(0,`rgba(${c},.85)`);r.addColorStop(.13,`rgba(${c},.5)`);r.addColorStop(.4,`rgba(${c},.16)`);r.addColorStop(1,`rgba(${c},0)`);g.fillStyle=r;g.fillRect(0,0,48,48);return s});
// Bake the round core into the halo so most particles need one canvas draw.
const coreSprites = palette.map((color, index) => {
  const sprite = document.createElement('canvas');
  sprite.width = sprite.height = 48;
  const context = sprite.getContext('2d');
  context.globalAlpha = 0.18;
  context.drawImage(sprites[index], 0, 0);
  context.globalAlpha = 1;
  context.fillStyle = 'rgb(' + color + ')';
  context.beginPath();
  context.arc(24, 24, 4.8, 0, TAU);
  context.fill();
  return sprite;
});

function populate(){seed=3862238;particles=[];stars=[];const count=Math.round((W<700?3600:8500)*quality.scale);
 for(let i=0;i<count;i++){const angle=random()*TAU,r=Math.pow(random(),.57),arm=i%3,spin=angle*.19+r*7.4+arm*TAU/3,spread=(random()-.5)*(.05+r*.18);const gx=Math.cos(spin)*r*.48+spread,gy=Math.sin(spin)*r*.24+spread*.55;let ex,ey;
 if(i%10<4){const u=random()*2-1,side=random()>.5?1:-1;ex=u*.48;ey=side*.205*Math.pow(Math.max(0,1-u*u),.78)+(random()-.5)*.019;}
 else{const a=random()*TAU,ir=.070+Math.pow(random(),.7)*.112,ridge=Math.sin(a*73)*.007;ex=Math.cos(a)*(ir+ridge);ey=Math.sin(a)*(ir+ridge);}
 particles.push({gx,gy,ex,ey,z:random()*2-1,size:.3+random()*.9,phase:random()*TAU,speed:.5+random(),color:random()<.15?4:Math.floor(random()*4),drift:random(),ambient:i%17===0});}
 for(let i=0;i<Math.round((W<700?300:850)*quality.scale);i++)stars.push({x:random(),y:random(),z:random(),p:random()*TAU,size:random()});
 // Preserve the main-site random sequence and all original shape attributes.
 particles.forEach((p,i)=>{p.id=i;p.iris=Math.hypot(p.ex,p.ey)<.20;p.networkColor=i%7===0?5:p.color;});
 const sortedX=[...particles].sort((a,b)=>a.gx-b.gx),sortedY=[...particles].sort((a,b)=>a.gy-b.gy);
 sortedX.forEach((p,i)=>p.nx=.015+.97*Math.pow((i+.5)/count,.69));
 sortedY.forEach((p,i)=>p.ny=.015+.97*((i+.5)/count));
}
const words=[...root.querySelectorAll('.floating-words span')],vocabulary=['灵感的引力','无界的想象','思维的星系','创意的涌现','算法的诗意','感知的边界','智能共生','生成未来','设计的可能','艺术与科技','想象的轨迹','灵感生长','BEYOND FORM','CREATIVE GRAVITY','ART × AI','DESIGN FUTURES','GENERATIVE VISIONS','HUMAN × MACHINE','INFINITE IDEAS','POETIC COMPUTATION','PERCEPTION','IMAGINATION'];let wordMaps=[];
function setupWords(){wordMaps=words.map((el,i)=>({el,angle:random()*TAU,r:.2+random()*.33,z:random()*.45-.22,offset:random()*16,period:10+random()*8,index:-1}));}
function drawWords(){for(let i=0;i<wordMaps.length;i++){const p=wordMaps[i],life=(time+p.offset)/p.period,cycle=Math.floor(life),phase=life-cycle;if(p.index!==cycle){p.el.textContent=vocabulary[Math.floor(random()*vocabulary.length)];p.index=cycle;}const angle=p.angle+time*.035,ox=Math.cos(angle)*p.r,oy=Math.sin(angle)*p.r*.5,oz=p.z,ca=Math.cos(time*.085),sa=Math.sin(time*.085),ct=Math.cos(.38),st=Math.sin(.38),rx=ox*ca+oz*sa,rz=-ox*sa+oz*ca,ry=oy*ct-rz*st,z=oy*st+rz*ct,scale=W<700?W*1.1:W*.73,proj=1/(1+z*.95),x=W*.54+rx*scale*proj,y=H*.415+ry*scale*proj;const opacity=Math.min(1,phase/.18,(1-phase)/.22);const avoidTitle=x<W*.45&&y>H*.22&&y<H*.5;const inBounds=x>W*.06&&x<W*.88&&y>H*.13&&y<H*.65;p.el.style.opacity=String(avoidTitle||!inBounds?0:opacity*.58);p.el.style.filter=`blur(${Math.max(0,z+.12)*3}px)`;p.el.style.transform=`translate(${x}px,${y}px)`;}
}
function resize(){const r=hero.getBoundingClientRect();W=r.width;H=r.height;dpr=Math.min(devicePixelRatio||1,quality.dpr);for(const c of [canvas,dust]){c.width=Math.round(W*dpr);c.height=Math.round(H*dpr);}ctx.setTransform(dpr,0,0,dpr,0,0);dc.setTransform(dpr,0,0,dpr,0,0);hero.style.setProperty('--glow-scale',Math.min(W/1920,1));populate();setupWords();paint(0);}
const readShape = () => root.dataset.visual === 'eye' ? 0 : 1;
let shape=readShape(),shapeTarget=shape,rotationTime=0;
function paint(dt){if(dt){const step=dt/2.8;shape+=Math.sign(shapeTarget-shape)*Math.min(Math.abs(shapeTarget-shape),step)}mouse.x=mix(mouse.x,pointer.x,.035);mouse.y=mix(mouse.y,pointer.y,.035);ctx.clearRect(0,0,W,H);ctx.globalCompositeOperation='lighter';
 for(const s of stars){const x=((s.x*W+Math.sin(time*.03+s.p)*14+mouse.x*s.z*16)%W+W)%W,y=s.y*H+Math.cos(time*.04+s.p)*7+mouse.y*s.z*10;ctx.fillStyle=`rgba(217,221,255,${(.13+.2*(.5+.5*Math.sin(time*.6+s.p)))*(1-s.z*.5)})`;ctx.fillRect(x,y,.45+s.size,.45+s.size);}
 const scale=W<700?W*1.35:W*.73,cx=W*(W<700?.57:.54),cy=H*(W<700?.385:.415);
 // Rotate a volumetric star field, then project it through a moving focal plane.
 rotationTime+=dt*(1-smooth(Math.max(0,Math.min(1,(shape-.24)/.76))));
 const yaw=rotationTime*.085,roll=rotationTime*.035,tilt=.38+Math.sin(rotationTime*.055)*.22;
 const ca=Math.cos(yaw),sa=Math.sin(yaw),cr=Math.cos(roll),sr=Math.sin(roll),ct=Math.cos(tilt),st=Math.sin(tilt);

 const eyeTurn=rotationTime*.12,ec=Math.cos(eyeTurn),es=Math.sin(eyeTurn);
 const eyeWeight=1-smooth(Math.max(0,Math.min(1,shape/.68)));
 const expansion=smooth(Math.max(0,Math.min(1,(shape-.24)/.76)));

 for(const p of particles){
  const orbit=rotationTime*.035*(.65+p.drift*.55),co=Math.cos(orbit),so=Math.sin(orbit);
  const ox=p.gx*co-p.gy*so,oy=p.gx*so+p.gy*co,oz=p.z*.22;
  const rx=ox*ca+oz*sa,rz=-ox*sa+oz*ca;
  const ry=oy*ct-rz*st,gz=oy*st+rz*ct;
  const gx=rx*cr-ry*sr,gy=rx*sr+ry*cr;
  p.galaxyX=gx;p.galaxyY=gy;
  // The eye remains legible while its iris and surrounding dust keep moving.
  const iris=p.iris;
  const ex=iris?p.ex*ec-p.ey*es:p.ex,ey=iris?p.ex*es+p.ey*ec:p.ey;
  let x=mix(gx,ex,eyeWeight),y=mix(gy,ey,eyeWeight);
  const z=mix(gz,p.z*.10+Math.sin(time*.17+p.phase)*.065,eyeWeight);
  const projection=1/Math.max(.48,1+z*1.65);
  x+=Math.sin(time*.15+p.phase)*.003;y+=Math.cos(time*.12+p.phase)*.003;
  if(p.ambient){x=mix(x,gx*1.8,.6);y=mix(y,gy*1.8,.6);}
  let px=cx+x*scale*projection+mouse.x*(14+z*55),py=cy+y*scale*projection+mouse.y*(8+z*40);
  // Spatial ranks preserve neighbors as the spiral opens out instead of shuffling points.
  const nx=p.nx*W+Math.sin(time*.13+p.gy*9)*W*.022;
  const ny=76+p.ny*(H-76)+Math.sin(time*.11+p.gx*8)*(H-76)*.025;
  const localExpansion=smooth(Math.max(0,Math.min(1,(shape-.24-p.drift*.018)/(.76-p.drift*.018))));
  const networkDepth=p.z*.48+Math.sin(time*.12+p.phase)*.045;
  const networkProjection=1/(1+networkDepth*.8);
  const depthX=W*.60+(nx-W*.60)*networkProjection;
  const depthY=H*.48+(ny-H*.48)*networkProjection;
  px=mix(px,depthX,localExpansion);py=mix(py,depthY,localExpansion);p.px=px;p.py=py;
  const color=expansion>.2?p.networkColor:p.color;
  const renderZ=mix(z,networkDepth,localExpansion);
  const near=Math.max(0,Math.min(1,(.12-renderZ)/.55));
  const perspective=mix(projection,networkProjection,localExpansion);
  const atom=p.id%19===0;
  const twinkle=.82+.18*Math.sin(time*p.speed*.5+p.phase);
  const alpha=(.30+near*.55)*twinkle;
  const radius=p.size*(W<700?1.05:1.5)*perspective*(.65+near*1.5)*(atom?1.7:1);
  // All particles retain a round core; a few near-camera atoms have a visible shell.
  const halo=radius*(atom?8:5);
  ctx.globalAlpha=alpha;
  if (atom) {
    ctx.globalAlpha=alpha*.5;
    ctx.drawImage(sprites[color],px-halo/2,py-halo/2,halo,halo);
    ctx.globalAlpha=alpha;
    ctx.fillStyle='rgb('+palette[color]+')';
    ctx.beginPath();ctx.arc(px,py,Math.max(.3,radius*.5),0,TAU);ctx.fill();
  } else {
    ctx.drawImage(coreSprites[color],px-halo/2,py-halo/2,halo,halo);
  }
  if(atom&&near>.35){
   ctx.globalAlpha=alpha*.22;ctx.strokeStyle='rgb('+palette[color]+')';ctx.lineWidth=.65;
   ctx.beginPath();ctx.arc(px,py,radius*1.25,0,TAU);ctx.stroke();
   ctx.globalAlpha=alpha*.8;ctx.fillStyle='#f9ffec';ctx.beginPath();ctx.arc(px-radius*.12,py-radius*.12,Math.max(.45,radius*.17),0,TAU);ctx.fill();
  }

 }
ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';drawLinks();drawWords();}

function drawLinks(){
 dc.clearRect(0,0,W,H);const networkOpacity=smooth(Math.max(0,Math.min(1,(shape-.58)/.42)));if(!networkOpacity||!W)return;dc.lineWidth=.7;dc.globalCompositeOperation='lighter';
 const nodes=particles.filter((p,i)=>i%20===0&&i%7!==0),reach=Math.min(160,W*.105),cell=reach;
 const grid=new Map();
 for(let i=0;i<nodes.length;i++){const p=nodes[i],key=Math.floor(p.px/cell)+','+Math.floor(p.py/cell);if(!grid.has(key))grid.set(key,[]);grid.get(key).push(i);}
 for(let i=0;i<nodes.length;i++){
  const a=nodes[i],gx=Math.floor(a.px/cell),gy=Math.floor(a.py/cell);let neighbors=[];
  for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)for(const j of grid.get((gx+dx)+','+(gy+dy))||[]){if(j<=i)continue;const b=nodes[j],d=Math.hypot(a.px-b.px,a.py-b.py);if(d<reach&&d>16&&(i*17+j*13)%5!==0)neighbors.push({b,j,d});}
  neighbors.sort((a,b)=>a.d-b.d);
  for(const {b,j,d} of neighbors.slice(0,8)){
   const cycle=(time+i*.37+j*.13)%11,progress=Math.min(1,cycle/1.8),fade=Math.min(1,(11-cycle)/2);
   const birth=Math.min(1,Math.max(0,(shape-.58-(i%35)*.002)/.25));
   const alpha=Math.pow(1-d/reach,1.25)*.48*fade*birth*networkOpacity;if(alpha<.01)continue;
   const t=smooth(progress),x=mix(a.px,b.px,t),y=mix(a.py,b.py,t),green=a.networkColor===5||b.networkColor===5;
   dc.strokeStyle='rgba('+(green?'216,248,69':'205,213,255')+','+alpha+')';dc.beginPath();dc.moveTo(a.px,a.py);dc.lineTo(x,y);dc.stroke();
   if(progress<1){dc.fillStyle=green?'rgba(216,248,69,.85)':'rgba(237,232,255,.7)';dc.beginPath();dc.arc(x,y,1.1,0,TAU);dc.fill();}
  }
 }
 dc.globalCompositeOperation='source-over';
}
function tick(now){raf=0;if(last && now-last < 1000/quality.fps-1){raf=requestAnimationFrame(tick);return;}if(paused||document.hidden||!visible){last=0;return;}const dt=last?Math.min((now-last)/1000,.05):0;last=now;time+=dt;const started=performance.now();paint(dt);reportFrame(performance.now()-started);raf=requestAnimationFrame(tick);}
function sync(){cancelAnimationFrame(raf);raf=0;last=0;if(!paused&&!document.hidden&&visible)raf=requestAnimationFrame(tick);}
listen(hero,'pointermove',e=>{const r=hero.getBoundingClientRect();pointer.x=(e.clientX-r.left)/W-.5;pointer.y=(e.clientY-r.top)/H-.5;});listen(hero,'pointerleave',()=>{pointer.x=pointer.y=0});
listen(document, 'visibilitychange', sync);
const visibility = new IntersectionObserver(([entry]) => {
  visible = entry.isIntersecting;
  sync();
}, {threshold:.02});
visibility.observe(hero);

const mode = new MutationObserver(() => {
  shapeTarget = readShape();
  if (paused || !visible || document.hidden) {
    shape = shapeTarget;
    paint(0);
  }
});
mode.observe(root, {attributes:true, attributeFilter:['data-visual']});

let resizeTimer;
listen(window, 'resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(resize, 120);
});
resize();
sync();
return () => {
  controller.abort();
  mode.disconnect();
  visibility.disconnect();
  clearTimeout(resizeTimer);
  cancelAnimationFrame(raf);
};
}
