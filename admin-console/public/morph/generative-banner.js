/* MORPH LAB: dependency-free Canvas 2D title art. */
(() => {
'use strict';
const CONFIG = {
  seed: 4261, dpr: 2, lineWidth: .85,
  colors: {primary:'#6554e8',ink:'#171a2f',soft:'#b8acf5',accent:'#d8f845'},
  learning:{nodesPerCluster:9,mobileNodes:8,radius:31,motion:3,cycle:6.5},
  cases:{layers:7,mobileLayers:5,samples:100,mobileSamples:64,period:24},
  tools:{travel:3.2},
  padding:{x:22,y:24}, hoverResponse:.8
};
const TAU=Math.PI*2;
function random(seed){return()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
function learning(seed,compact){const rng=random(seed),n=compact?CONFIG.learning.mobileNodes:CONFIG.learning.nodesPerCluster;
 const nodes=[],edges=[],bridges=[];
 for(let c=0;c<3;c++)for(let i=0;i<n;i++){const a=i/n*TAU+(rng()-.5)*.35,r=i===0?0:14+rng()*19;nodes.push({c,dx:Math.cos(a)*r,dy:Math.sin(a)*r,phase:rng()*TAU,size:2+rng()*1.2})}
 for(let c=0;c<3;c++){const degree=Array(n).fill(0);const pairs=[];for(let i=0;i<n;i++)for(let j=i+1;j<n;j++){const a=nodes[c*n+i],b=nodes[c*n+j];pairs.push({i,j,d:Math.hypot(a.dx-b.dx,a.dy-b.dy)})}pairs.sort((a,b)=>a.d-b.d);for(const {i,j} of pairs)if(degree[i]<3&&degree[j]<3){edges.push([c*n+i,c*n+j]);degree[i]++;degree[j]++}}
 for(let c=0;c<2;c++){const a=c*n+1,b=(c+1)*n+Math.floor(n/2);edges.push([a,b]);bridges.push([a,b])}
 return{nodes,edges,bridges,n};}
class GenerativeBanner{
 constructor(hero,{variant='learning',seed=CONFIG.seed,interactive=true}={}){
 this.hero=hero;this.variant=variant;this.seed=seed;this.interactive=interactive;this.time=0;this.last=0;this.frame=0;this.visible=true;this.paused=false;this.dead=false;this.hover=-1;this.emphasis=[0,0,0,0,0,0,0,0];this.motion=matchMedia('(prefers-reduced-motion: reduce)');this.abort=new AbortController();
 this.art=document.createElement('div');this.art.className='banner-art';this.canvas=document.createElement('canvas');this.canvas.setAttribute('aria-hidden','true');this.ctx=this.canvas.getContext('2d');this.button=document.createElement('button');this.button.className='banner-toggle';this.button.type='button';this.art.append(this.canvas,this.button);hero.append(this.art);this.updateButton();
 const opts={signal:this.abort.signal};this.button.addEventListener('click',()=>{this.paused=!this.paused;this.updateButton();this.schedule()},opts);
 hero.addEventListener('pointermove',e=>this.pointer(e),opts);hero.addEventListener('pointerleave',()=>{this.hover=-1},opts);document.addEventListener('visibilitychange',()=>this.schedule(),opts);this.motion.addEventListener('change',()=>{this.hover=-1;this.emphasis.fill(0);this.updateButton();this.draw();this.schedule()},opts);
 this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(this.art);this.observer=new IntersectionObserver(es=>{this.visible=es[0].isIntersecting;this.schedule()});this.observer.observe(hero);this.resize();this.schedule();
 }
 updateButton(){this.button.textContent=this.paused?'▷ 继续':'Ⅱ 暂停';this.button.setAttribute('aria-label',(this.paused?'继续':'暂停')+'标题背景动画');this.button.setAttribute('aria-pressed',String(this.paused));this.button.disabled=this.motion.matches}
 resize(){const r=this.art.getBoundingClientRect();this.w=r.width;this.h=r.height;this.compact=innerWidth<=768;const d=Math.min(devicePixelRatio||1,CONFIG.dpr);this.canvas.width=Math.round(this.w*d);this.canvas.height=Math.round(this.h*d);this.ctx.setTransform(d,0,0,d,0,0);this.data=learning(this.seed,this.compact);this.draw()}
 schedule(){cancelAnimationFrame(this.frame);this.frame=0;this.last=0;if(!this.dead&&!this.paused&&!this.motion.matches&&this.visible&&!document.hidden)this.frame=requestAnimationFrame(t=>this.tick(t))}
 tick(t){this.frame=0;if(this.dead||this.paused||this.motion.matches||!this.visible||document.hidden)return;const dt=this.last?Math.min((t-this.last)/1000,.05):0;this.last=t;this.time+=dt;const k=1-Math.exp(-dt/CONFIG.hoverResponse);this.emphasis=this.emphasis.map((v,i)=>v+((this.hover===i?1:0)-v)*k);this.draw();this.frame=requestAnimationFrame(t=>this.tick(t))}
 pointer(e){if(!this.interactive||this.paused||this.motion.matches||e.target===this.button){this.hover=-1;return}const r=this.art.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;if(x<0||y<0||x>r.width||y>r.height){this.hover=-1;return}const positions=this.positions||[];let best=-1,distance=Infinity;positions.forEach((p,i)=>{const d=Math.hypot(x-p.x,y-p.y);if(d<distance){distance=d;best=i}});this.hover=distance<(this.variant==='tools'?40:100)?best:-1}
 stroke(color,alpha=1,width=CONFIG.lineWidth){this.ctx.strokeStyle=color;this.ctx.globalAlpha=alpha;this.ctx.lineWidth=width}
 dot(x,y,r,color,alpha=1){const c=this.ctx;c.globalAlpha=alpha;c.fillStyle=color;c.beginPath();c.arc(x,y,r,0,TAU);c.fill()}
 line(a,b,color,alpha=.3){const c=this.ctx;this.stroke(color,alpha);c.beginPath();c.moveTo(a.x,a.y);c.lineTo(b.x,b.y);c.stroke()}
 draw(){if(!this.w||!this.h)return;const c=this.ctx;c.clearRect(0,0,this.w,this.h);c.lineCap='round';c.lineJoin='round';this[this.variant]();c.globalAlpha=1}
 learning(){const c=this.ctx,C=CONFIG.colors,{nodes,edges,bridges,n}=this.data;const pad=Math.min(60,this.w*.17),cy=(this.h-14)*.48;const centers=[0,1,2].map(i=>({x:pad+(this.w-2*pad)*i/2,y:cy+(i===1?-7:4)}));this.positions=centers;const scale=Math.min(1,(this.h-32)/85);const ps=nodes.map(p=>({x:centers[p.c].x+p.dx*scale+Math.sin(this.time*.4+p.phase)*CONFIG.learning.motion,y:centers[p.c].y+p.dy*scale+Math.cos(this.time*.35+p.phase)*CONFIG.learning.motion}));
 edges.forEach(([a,b])=>this.line(ps[a],ps[b],C.primary,.2+this.emphasis[nodes[a].c]*.22));nodes.forEach((p,i)=>this.dot(ps[i].x,ps[i].y,p.size*.72,i===0?C.accent:(i%n===0?C.ink:C.primary),i===0?1:.4+this.emphasis[p.c]*.3));
 // A sparse signal crosses one bridge during a 6.5-second cycle.
 const cycle=CONFIG.learning.cycle,phase=this.time%cycle;if(phase<2.5&&!this.motion.matches){const path=bridges[Math.floor(this.time/cycle)%bridges.length],a=ps[path[0]],b=ps[path[1]],t=phase/2.5;this.dot(a.x+(b.x-a.x)*t,a.y+(b.y-a.y)*t,2.5,C.primary,.8);this.dot(b.x,b.y,3,C.primary,.2+Math.sin(t*Math.PI)*.35)}
 }
 cases(){const c=this.ctx,C=CONFIG.colors,layers=this.compact?CONFIG.cases.mobileLayers:CONFIG.cases.layers,samples=this.compact?CONFIG.cases.mobileSamples:CONFIG.cases.samples;const radius=Math.min((this.h-34)*.38,this.w/9),cy=(this.h-14)*.47;this.positions=[.18,.5,.82].map(f=>({x:this.w*f,y:cy}));const phase=this.time*TAU/CONFIG.cases.period;
 for(let j=0;j<3;j++){const center=this.positions[j],a=.045+j*.034+this.emphasis[j]*.023,b=.018+j*.012;for(let l=0;l<layers;l++){const R=radius*(.53+l/(layers-1)*.47);this.stroke(l===layers-1?C.primary:C.soft,l===layers-1?.59:.4);c.beginPath();for(let k=0;k<=samples;k++){const theta=k/samples*TAU,r=R*(1+a*Math.sin(3*theta+phase)+b*Math.cos(5*theta-phase));const x=center.x+Math.cos(theta)*r,y=center.y+Math.sin(theta)*r;if(k===0)c.moveTo(x,y);else c.lineTo(x,y)}c.closePath();c.stroke()}}
 for(let i=0;i<2;i++){const x=(this.positions[i].x+this.positions[i+1].x)/2;this.line({x:x-5,y:cy},{x:x+5,y:cy},C.soft,.5);this.dot(x,cy,1.4,C.primary,.45)}
 const a=.113,b=.042,theta=-.6,center=this.positions[2],r=radius*(1+a*Math.sin(3*theta+phase)+b*Math.cos(5*theta-phase));this.dot(center.x+Math.cos(theta)*r,center.y+Math.sin(theta)*r,3,C.accent);
 }
 tools(){const c=this.ctx,C=CONFIG.colors,cy=(this.h-18)*.5,span=Math.min(32,(this.h-38)/2);const normalized=[[.08,0],[.31,-1],[.31,1],[.55,-1],[.55,1],[.77,0],[.93,0]];const ps=normalized.map(([x,y])=>({x:20+(this.w-40)*x,y:cy+y*span}));this.positions=ps;const edges=[[0,1],[0,2],[1,3],[2,4],[3,5],[4,5],[5,6]];
 const bez=(a,b,t)=>{const mx=(a.x+b.x)/2,u=1-t;return{x:u*u*u*a.x+3*u*u*t*mx+3*u*t*t*mx+t*t*t*b.x,y:u*u*u*a.y+3*u*u*t*a.y+3*u*t*t*b.y+t*t*t*b.y}};
 const t=this.time/CONFIG.tools.travel,index=Math.floor(t)%4;const paths=[[0,2,4,6],[1,3,5,6]];const active=paths.map(path=>path[index]);const arriving=active.map(i=>edges[i][1]);
 edges.forEach(([ai,bi],i)=>{const a=ps[ai],b=ps[bi],mx=(a.x+b.x)/2;this.stroke(C.primary,.25+Math.max(this.emphasis[ai],this.emphasis[bi])*.3);c.beginPath();c.moveTo(a.x,a.y);c.bezierCurveTo(mx,a.y,mx,b.y,b.x,b.y);c.stroke()});
 ps.forEach((p,i)=>{const pulse=arriving.includes(i)?Math.max(0,(t%1-.82)/.18)*.22:0;this.stroke(i===0||i===6?C.ink:C.primary,.4+this.emphasis[i]*.3+pulse,1);c.fillStyle='rgba(246,243,253,.9)';c.beginPath();const size=this.compact?9:12;if(i===0||i===6)c.arc(p.x,p.y,size*.72,0,TAU);else if(i===2||i===4){c.moveTo(p.x,p.y-size);c.lineTo(p.x+size,p.y);c.lineTo(p.x,p.y+size);c.lineTo(p.x-size,p.y);c.closePath()}else c.roundRect(p.x-size,p.y-size,size*2,size*2,4);c.fill();c.stroke();if(i===0)this.dot(p.x,p.y,3,C.accent)});
 if(!this.motion.matches)active.forEach(i=>{const [a,b]=edges[i],p=bez(ps[a],ps[b],t%1);this.dot(p.x,p.y,2,C.primary,.75)});
 }
 destroy(){this.dead=true;cancelAnimationFrame(this.frame);this.abort.abort();this.resizeObserver.disconnect();this.observer.disconnect();this.art.remove()}
}
let active=null;function mount(){if(active)return;const hero=document.querySelector('[data-banner]');if(hero)active=new GenerativeBanner(hero,{variant:hero.dataset.banner,seed:Number(hero.dataset.seed)||CONFIG.seed,interactive:hero.dataset.interactive!=='false'})}mount();addEventListener('pagehide',()=>{active?.destroy();active=null});addEventListener('pageshow',mount);
// Public constructor and configuration for reuse; no dependencies or asset fetches.
window.MorphBanner={GenerativeBanner,CONFIG};
})();
