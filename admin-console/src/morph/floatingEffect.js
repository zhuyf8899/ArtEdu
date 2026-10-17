
/* 原生 Canvas 2D，无外部依赖。配色及模块数量集中在 CONFIG 中。 */
export function mountFloating(root) {
const CONFIG={background:'#F2F1FA',purple:[99,82,237],lime:[221,247,68],count:22,rate:1.3};
const banner=root.querySelector('#effect-stage'),canvas=root.querySelector('#effect-canvas'),ctx=canvas.getContext('2d');
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
let W=0,H=0,dpr=1,time=0,paused=reduced.matches,visible=true,last=0,raf=0,rate=CONFIG.rate;
let seed=902;
function rnd(){seed=(seed*1664525+1013904223)>>>0;return seed/4294967296}
function ink(a,lime=false){return `rgba(${(lime?CONFIG.lime:CONFIG.purple).join(',')},${Math.max(0,Math.min(1,a))})`}
function makeBox(initial=false){const life=2.5+rnd()*1.4;return {u:.32+rnd()*.68,v:.15+rnd()*.78,z:.5+rnd()*.7,w:65+rnd()*145,h:20+rnd()*28,life,age:initial?rnd()*life:0,phase:rnd()*Math.PI*2,accent:rnd()>.8,kind:Math.floor(rnd()*4)}}
const boxes=Array.from({length:CONFIG.count},()=>makeBox(true));
function dot(x,y,r,a,lime=false){ctx.fillStyle=ink(a,lime);ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill()}
function update(dt){time+=dt;for(let i=0;i<boxes.length;i++){boxes[i].age+=dt*rate;if(boxes[i].age>=boxes[i].life)boxes[i]=makeBox()}}
function draw(){
ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,W,H);

const scale=Math.min(W/1000,1);
const list=boxes.map((b,i)=>{const a=Math.max(0,Math.min(1,b.age/.35,(b.life-b.age)/.5));return {...b,id:i,a,x:b.u*W+Math.sin(time*.3+b.phase)*14,y:b.v*H-b.age/b.life*45*b.z,w:b.w*b.z*scale,h:b.h*b.z*scale}}).sort((a,b)=>a.z-b.z);
for(let i=0;i<list.length;i++){
const b=list[i],q=list[(i+3)%list.length],a=b.a*(.4+b.z*.4);
if(q&&Math.hypot(b.x-q.x,b.y-q.y)<340){for(let j=0;j<3;j++){
const x1=b.x+b.w*(j-1)*.15,y1=b.y+b.h/2,x2=q.x+q.w*(j-1)*.15,y2=q.y-q.h/2,opacity=Math.min(b.a,q.a)*.25;
ctx.strokeStyle=ink(opacity);ctx.lineWidth=.65;ctx.beginPath();ctx.moveTo(x1,y1);ctx.bezierCurveTo(x1,y1+42,x2,y2-42,x2,y2);ctx.stroke();
const u=(time*.4+i*.17+j*.12)%1,v=1-u;dot(v*v*v*x1+3*v*v*u*x1+3*v*u*u*x2+u*u*u*x2,v*v*v*y1+3*v*v*u*(y1+42)+3*v*u*u*(y2-42)+u*u*u*y2,1.5,opacity*3,j===0)
}}
const x=b.x-b.w/2,y=b.y-b.h/2,g=ctx.createLinearGradient(x,y,x,y+b.h);
g.addColorStop(0,ink(a*.35,b.accent));g.addColorStop(.3,ink(a*.06,b.accent));g.addColorStop(.8,ink(a*.015,b.accent));g.addColorStop(1,ink(a*.2,b.accent));
ctx.fillStyle=g;ctx.fillRect(x,y,b.w,b.h);ctx.strokeStyle=ink(a,b.accent);ctx.lineWidth=.85;ctx.strokeRect(x,y,b.w,b.h);dot(x+b.w,y+b.h,2,a,true);
ctx.fillStyle=ink(a*.85);ctx.font=`${Math.max(7,8*b.z)}px monospace`;ctx.fillText(['MODEL','SKILL','LoRA','FLOW'][b.kind],x+6,y+b.h*.66)
}

}
function resize(){const r=banner.getBoundingClientRect();W=r.width;H=r.height;dpr=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(W*dpr);canvas.height=Math.round(H*dpr);draw()}
function frame(now){raf=0;if(paused||!visible||document.hidden)return;const dt=last?Math.min((now-last)/1000,.04):0;last=now;update(dt);draw();raf=requestAnimationFrame(frame)}
function start(){last=0;if(!raf&&!paused&&!reduced.matches&&visible&&!document.hidden)raf=requestAnimationFrame(frame)}
function stop(){cancelAnimationFrame(raf);raf=0;last=0}

const ro=new ResizeObserver(resize);ro.observe(banner);
const io=new IntersectionObserver(e=>{visible=e[0].isIntersecting;visible?start():stop()});io.observe(banner);
const visibility=()=>document.hidden?stop():start();document.addEventListener('visibilitychange',visibility);
const reduce=e=>{paused=e.matches;if(paused){stop();draw()}else start()};reduced.addEventListener('change',reduce);
// SPA 集成时，在组件卸载阶段调用返回的销毁方法。
const destroy=()=>{stop();ro.disconnect();io.disconnect();document.removeEventListener('visibilitychange',visibility);reduced.removeEventListener('change',reduce);};
resize();start();return destroy;

}
