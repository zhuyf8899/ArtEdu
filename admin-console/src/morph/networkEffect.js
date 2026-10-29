import { mountQuality, frameBudget } from './displayQuality.js';

export function mountNetwork(root) { return mountQuality(root, mountEffect); }
function mountEffect(root, quality) {
const reportFrame = frameBudget(quality);
const BG='#F2F1FA',P=[99,82,237],Y=[221,247,68],TAU=Math.PI*2;
const SPEED=1.6,RANGE=160;
const stage=root.querySelector('#effect-stage'),canvas=root.querySelector('#effect-canvas'),ctx=canvas.getContext('2d');
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
let W=0,H=0,dpr=1,time=0,mode=0;
let paused=reduced.matches||!quality.fps,last=0,raf=0,visible=true;
const mouse={x:0,y:0,on:false};
let seed=902;
function rnd(){seed=(seed*1664525+1013904223)>>>0;return seed/4294967296}
function ink(a,yellow=0){
const u=Math.max(0,Math.min(1,yellow));
const c=P.map((v,i)=>Math.round(v+(Y[i]-v)*u));
return `rgba(${c.join(',')},${Math.max(0,Math.min(1,a))})`;
}
const particles=Array.from({length:Math.round(290*quality.scale)},()=>({
x:(rnd()-.5)*1000,y:(rnd()-.5)*570,z:rnd()*640-120,
vx:(rnd()-.5)*30,vy:(rnd()-.5)*25,vz:(rnd()-.5)*24,
phase:rnd()*TAU,r:1+rnd()*1.2,accent:rnd()>.92,pull:0
}));
// 约两成粒子始终独立漂浮；其他粒子也只连接部分近邻。
particles.forEach((p,i)=>p.isolated=i%5===0);
function makeBox(initial=false){
const life=2.5+rnd()*1.4;
return {u:.32+rnd()*.68,v:.15+rnd()*.78,z:.5+rnd()*.7,
w:65+rnd()*145,h:20+rnd()*28,life,age:initial?rnd()*life:0,
phase:rnd()*TAU,accent:rnd()>.8,kind:Math.floor(rnd()*4)};
}
const boxes=Array.from({length:22},()=>makeBox(true));
function layout(){
return {cx:W*.53,cy:H*.5,scale:Math.min(W/980,H/410,1.15)*1.3};
}
function project(p){
const {cx,cy,scale}=layout(),sway=Math.sin(time*.08)*.065;
const x=p.x*Math.cos(sway)-p.z*Math.sin(sway);
const z=p.x*Math.sin(sway)+p.z*Math.cos(sway);
const k=620/(620+z+190);
return {x:cx+x*k*scale,y:cy+p.y*k*scale,k,z};
}
function update(dt){
time+=dt;
if(mode===0){
for(const p of particles){
p.x+=(p.vx+Math.sin(time*.28+p.phase+p.z*.006)*10)*dt*SPEED;
p.y+=(p.vy+Math.cos(time*.23+p.phase+p.x*.005)*9)*dt*SPEED;
p.z+=p.vz*dt*SPEED;
const screen=project(p);
const d=mouse.on?Math.hypot(screen.x-mouse.x,screen.y-mouse.y):9999;
const target=mouse.on?Math.max(0,1-d/210):0;
p.pull+=(target-p.pull)*(1-Math.exp(-dt*2));
if(mouse.on&&p.pull>.01){
const {cx,cy,scale}=layout(),sway=Math.sin(time*.08)*.065;
const tx=(mouse.x-cx)/(screen.k*scale),ty=(mouse.y-cy)/(screen.k*scale);
const targetX=(tx+p.z*Math.sin(sway))/Math.cos(sway);
const orbit=7+5*Math.sin(p.phase),k=1-Math.exp(-dt*.65*p.pull);
p.x+=(targetX+Math.cos(p.phase+time*.1)*orbit-p.x)*k;
p.y+=(ty+Math.sin(p.phase+time*.1)*orbit-p.y)*k;
}
for(const [axis,vel,min,max] of [
['x','vx',-500,500],['y','vy',-285,285],['z','vz',-120,520]
]){
if(p[axis]<min){p[axis]=min;p[vel]=Math.abs(p[vel])}
if(p[axis]>max){p[axis]=max;p[vel]=-Math.abs(p[vel])}
}
}
}else{
for(let i=0;i<boxes.length;i++){
boxes[i].age+=dt*1.3;
if(boxes[i].age>=boxes[i].life)boxes[i]=makeBox();
}
}
}
function dot(x,y,r,a,yellow=0){
ctx.fillStyle=ink(a,yellow);ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.fill();
}
function aggregation(p){
return Math.min(1,Math.max(0,(p.pull-.08)/.55));
}
function network(){
const projected=particles.map(project),cells=new Map(),cell=RANGE;
particles.forEach((p,i)=>{
if(p.isolated)return;
const key=[Math.floor(p.x/cell),Math.floor(p.y/cell),Math.floor(p.z/cell)].join(',');
if(!cells.has(key))cells.set(key,[]);
cells.get(key).push(i);
});
particles.forEach((p,i)=>{
if(p.isolated)return;
const gx=Math.floor(p.x/cell),gy=Math.floor(p.y/cell),gz=Math.floor(p.z/cell);
for(let x=-1;x<=1;x++)for(let y=-1;y<=1;y++)for(let z=-1;z<=1;z++){
const list=cells.get([gx+x,gy+y,gz+z].join(','));if(!list)continue;
for(const j of list){
if(j<=i||(i*17+j*13)%5===0)continue;
const q=particles[j],d=Math.hypot(p.x-q.x,p.y-q.y,p.z-q.z);
if(d>=RANGE||d<16)continue;
const a=projected[i],b=projected[j],depth=Math.min(a.k,b.k);
const yellow=Math.min(aggregation(p),aggregation(q));
const opacity=Math.pow(1-d/RANGE,1.25)*(.48+yellow*.25)*Math.pow(depth,1.5);
ctx.strokeStyle=ink(opacity,yellow);ctx.lineWidth=(.4+depth*.65)*1.3;
ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();
if((i*11+j*7)%137===0&&d<RANGE*.8){
const u=(time*.09+(i+j)*.17)%1;
dot(a.x+(b.x-a.x)*u,a.y+(b.y-a.y)*u,1.95*depth,opacity*2,1);
}
}
}
});
const order=particles.map((p,i)=>({p,s:projected[i]})).sort((a,b)=>b.s.z-a.s.z);
for(const {p,s} of order){
const yellow=Math.max(p.accent?1:0,aggregation(p));
const alpha=Math.min(.98,.22+s.k*.65+aggregation(p)*.15);
const r=p.r*s.k*1.3;
if(yellow>.6)dot(s.x,s.y,r+1.2,alpha*.15,yellow);
dot(s.x,s.y,r,alpha,yellow);
}
}
function floating(){
const scale=Math.min(W/1000,1);
const list=boxes.map((b,i)=>{
const a=Math.max(0,Math.min(1,b.age/.35,(b.life-b.age)/.5));
return {...b,id:i,a,x:b.u*W+Math.sin(time*.3+b.phase)*14,
y:b.v*H-b.age/b.life*45*b.z,w:b.w*b.z*scale,h:b.h*b.z*scale};
}).sort((a,b)=>a.z-b.z);
for(let i=0;i<list.length;i++){
const b=list[i],q=list[(i+3)%list.length],a=b.a*(.4+b.z*.4);
if(q&&Math.hypot(b.x-q.x,b.y-q.y)<340){
for(let j=0;j<3;j++){
const x1=b.x+b.w*(j-1)*.15,y1=b.y+b.h/2,x2=q.x+q.w*(j-1)*.15,y2=q.y-q.h/2;
const opacity=Math.min(b.a,q.a)*.25;
ctx.strokeStyle=ink(opacity);ctx.lineWidth=.65;ctx.beginPath();ctx.moveTo(x1,y1);
ctx.bezierCurveTo(x1,y1+42,x2,y2-42,x2,y2);ctx.stroke();
const u=(time*.4+i*.17+j*.12)%1,v=1-u;
dot(v*v*v*x1+3*v*v*u*x1+3*v*u*u*x2+u*u*u*x2,
v*v*v*y1+3*v*v*u*(y1+42)+3*v*u*u*(y2-42)+u*u*u*y2,
1.5,opacity*3,j===0?1:0);
}
}
const x=b.x-b.w/2,y=b.y-b.h/2,g=ctx.createLinearGradient(x,y,x,y+b.h),accent=b.accent?1:0;
g.addColorStop(0,ink(a*.35,accent));g.addColorStop(.3,ink(a*.06,accent));
g.addColorStop(.8,ink(a*.015,accent));g.addColorStop(1,ink(a*.2,accent));
ctx.fillStyle=g;ctx.fillRect(x,y,b.w,b.h);
ctx.strokeStyle=ink(a,accent);ctx.lineWidth=.85;ctx.strokeRect(x,y,b.w,b.h);
dot(x+b.w,y+b.h,2,a,1);
ctx.fillStyle=ink(a*.85);ctx.font=`${Math.max(7,8*b.z)}px monospace`;
ctx.fillText(['MODEL','SKILL','LoRA','FLOW'][b.kind],x+6,y+b.h*.66);
}
}
function draw(){
ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,W,H);

mode?floating():network();

}
function resize(){
const r=stage.getBoundingClientRect();W=r.width;H=r.height;dpr=Math.min(devicePixelRatio||1,quality.dpr);
canvas.width=Math.round(W*dpr);canvas.height=Math.round(H*dpr);draw();
}
function frame(now){
raf=0;if(paused||!visible||document.hidden)return;
if(last && now-last < 1000/quality.fps-1){raf=requestAnimationFrame(frame);return;}
const dt=last?Math.min((now-last)/1000,.04):0;last=now;
const started=performance.now();update(dt);draw();reportFrame(performance.now()-started);raf=requestAnimationFrame(frame);
}
function start(){last=0;if(!raf&&!paused&&!reduced.matches&&visible&&!document.hidden)raf=requestAnimationFrame(frame)}
function stop(){cancelAnimationFrame(raf);raf=0;last=0}
const pointerMove=e=>{if(paused||reduced.matches)return;
const r=stage.getBoundingClientRect();mouse.x=e.clientX-r.left;mouse.y=e.clientY-r.top;mouse.on=true;
};stage.addEventListener('pointermove',pointerMove);
const pointerLeave=()=>mouse.on=false;stage.addEventListener('pointerleave',pointerLeave);
const ro=new ResizeObserver(resize);ro.observe(stage);
const io=new IntersectionObserver(e=>{visible=e[0].isIntersecting;visible?start():stop()});io.observe(stage);
const visibility=()=>document.hidden?stop():start();document.addEventListener('visibilitychange',visibility);
const motion=e=>{paused=e.matches||!quality.fps;if(e.matches){mouse.on=false;stop();draw()}else start()};reduced.addEventListener('change',motion);
const destroy=()=>{stop();ro.disconnect();io.disconnect();stage.removeEventListener('pointermove',pointerMove);stage.removeEventListener('pointerleave',pointerLeave);document.removeEventListener('visibilitychange',visibility);reduced.removeEventListener('change',motion);};resize();start();return destroy;

}
