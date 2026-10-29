import {useEffect,useRef} from 'react';

// A data chart, drawn from the selected learner records; artwork is not a score.
export function PortraitRadar({axes,selected,onSelect,mode,compact=false}){
 const canvas=useRef(null),root=useRef(null);
 useEffect(()=>{
  const element=canvas.current,container=root.current;
  const draw=()=>{
   const width=container.clientWidth,height=container.clientHeight,dpr=Math.min(window.devicePixelRatio||1,2);
   container.style.setProperty('--portrait-label-radius',Math.min(width,height)*.42+'px');
   element.width=width*dpr;element.height=height*dpr;const ctx=element.getContext('2d');ctx.scale(dpr,dpr);ctx.clearRect(0,0,width,height);
   const x=width/2,y=height/2,radius=Math.min(width*.31,height*.31),angle=i=>-Math.PI/2+i*Math.PI*2/axes.length;
   const point=(i,r)=>[x+Math.cos(angle(i))*r,y+Math.sin(angle(i))*r];
   const polygon=values=>{ctx.beginPath();values.forEach(([px,py],i)=>i?ctx.lineTo(px,py):ctx.moveTo(px,py));ctx.closePath();};
   ctx.lineWidth=1;ctx.strokeStyle='#434864';
   for(let ring=1;ring<=4;ring++){polygon(axes.map((_,i)=>point(i,radius*ring/4)));ctx.stroke();}
   axes.forEach((_,i)=>{ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(...point(i,radius));ctx.strokeStyle='#333952';ctx.stroke();});
   if(axes.some(a=>a.percent!==null)){
    polygon(axes.map((a,i)=>point(i,radius*(a.percent??0)/100)));ctx.fillStyle='#8e80dd38';ctx.fill();ctx.strokeStyle='#b5aaff';ctx.lineWidth=2;ctx.stroke();
    axes.forEach((a,i)=>{if(a.percent===null)return;const p=point(i,radius*a.percent/100);ctx.beginPath();ctx.arc(...p,4,0,Math.PI*2);ctx.fillStyle=a.direction===selected?'#d8f845':'#b5aaff';ctx.fill();ctx.strokeStyle='#171a30';ctx.stroke();});
   }else{
    ctx.textAlign='center';ctx.fillStyle='#969bb5';ctx.font='13px "Microsoft YaHei",sans-serif';ctx.fillText(mode==='practice'?'等待真实练习与评价':'从一次学习开始',x,y+5);
   }
  };
  const observer=new ResizeObserver(draw);observer.observe(container);draw();return()=>observer.disconnect();
 },[axes,selected,mode]);
 const description=axes.map(a=>`${a.direction}：${a.percent===null?'暂无证据':a.percent+'%（'+a.numerator+'/'+a.denominator+'）'}`).join('；');
 return <div className={'portrait-radar'+(compact?' is-compact':'')} ref={root}>
  <canvas ref={canvas} role="img" aria-label={(mode==='practice'?'实践验证比例':'学习完成覆盖')+'。'+description}/>
  <div className="portrait-axis-labels">{axes.map((axis,i)=>{const angle=-Math.PI/2+i*Math.PI*2/axes.length;return <button key={axis.direction} type="button" aria-pressed={selected===axis.direction} onClick={()=>onSelect(axis.direction)} style={{left:`calc(50% + ${Math.cos(angle)} * var(--portrait-label-radius))`,top:`calc(50% + ${Math.sin(angle)} * var(--portrait-label-radius))`}} aria-label={axis.direction+'，'+(axis.percent===null?'暂无证据':axis.percent+'%')+'，查看学习证据'}><strong>{axis.direction}</strong><span>{axis.percent===null?'暂无证据':axis.percent+'%'}</span></button>;})}</div>
 </div>;
}
