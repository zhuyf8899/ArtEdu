(()=>{
const A=window.ATOMIC_COURSES,R=window.NODE_RELATIONS,$=id=>document.getElementById(id),esc=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const names=[...new Set(A.filter(n=>n.sourceEntityType!=='node').map(n=>n.sourceCourse))],centers={'社会议题':[920,250],'设计基础':[400,230],'数据可视化':[360,430],'人工智能':[590,215],'编程交互':[650,405],'视听叙事':[480,525],'空间场景':[885,365],'工艺制作':[805,490]},nodes=[],courses=[];
const lead={'面向设计应用的人工智能基础':'焦阳','测控技术与仪器专业实践':'赵晓光','设计伦理：议题、历史与案例':'王小茉','社会政策':'蒙克','服饰文化与跨媒介时尚设计':'李迎军','媒体计算与艺术表现':'张松海','数据分析与可视化表达':'吴琼','Vibe Coding':'肖岚茜','人工智能与艺术设计':'冯涛','创意图形编程':'师丹青','数智AI时代的场景设计':'聂影','未来城市：万维社群':'聂影','展示设计研究与创新实践':'任续超','未来场景世界观设计及综合表达':'陈洛奇','刺绣工艺与数智设计':'张红娟','装饰图案智能协同设计':'张红娟','AI 时代的图案程式化':'金奕奕','提花织物图案的智能设计':'金奕奕'};
names.forEach((name,i)=>{let angle=-Math.PI/2+i*Math.PI*2/names.length;courses.push({id:'course-'+i,title:name,teacher:lead[name],x:600+500*Math.cos(angle),y:380+322*Math.sin(angle),course:true});});
const relationBy=new Map();R.forEach((r,i)=>r.ids.forEach(id=>relationBy.set(id,i)));
const special=[[570,375],[535,205],[650,155],[750,510],[920,370],[355,300]];
const buckets={};A.forEach(n=>{const key=relationBy.has(n.id)?'r'+relationBy.get(n.id):n.categories[0];(buckets[key]??=[]).push(n)});
Object.entries(buckets).forEach(([key,list])=>{const center=key[0]==='r'?special[+key.slice(1)]:centers[key];list.forEach((n,i)=>{const angle=i*2.39996;const radius=key[0]==='r'?20+Math.sqrt(i)*27:20+Math.sqrt(i)*17;nodes.push({...n,x:center[0]+Math.cos(angle)*radius,y:center[1]+Math.sin(angle)*radius,related:relationBy.has(n.id)});});});
const fengRepresentative=nodes.find(n=>n.id==='submitted-024');
if(fengRepresentative)fengRepresentative.title='Agentic AI前沿趋势及设计案例';
const featuredLayout={'Vibe Coding':[565,335],'数据日志':[305,320],'设计师主导的 AI Agent 协同设计':[435,175],'具身空间行为分析与 AI 辅助设计迭代':[855,270],'Agentic AI前沿趋势及设计案例':[565,430],'智能体交互设计与实践':[700,410],'网络数据挖掘':[650,430],'智能体与时尚应用':[715,345],'可变形模块化织物设计':[500,410]};
const miniLayout={'媒体计算与艺术表现':[705,650],'抽象与隐喻':[300,190],'科学可视化':[285,450],'图像与文本数据分析基础':[330,550],'由“声”入“形”——音乐驱动的图像生成':[510,580],'图案的程式化':[825,650],'物象观察与写生':[310,650],'AI 辅助编程':[700,375],'场景内容创作':[490,680]};
const major=['数据分析与可视化表达','人工智能与艺术设计','创意图形编程'];const medium=['面向设计应用的人工智能基础','设计伦理：议题、历史与案例','服饰文化与跨媒介时尚设计','刺绣工艺与数智设计','数智AI时代的场景设计','AI 时代的图案程式化'];
courses.forEach(c=>{c.level=major.includes(c.title)?'major':medium.includes(c.title)?'compact':'dot';if(c.title===major[0]){c.x=105;c.y=350}if(c.title===major[1]){c.x=640;c.y=65}if(c.title===major[2]){c.x=1080;c.y=410}});
const compactPositions={'刺绣工艺与数智设计':[150,690],'展示设计研究与创新实践':[1060,635],'数智AI时代的场景设计':[1060,180],'AI 时代的图案程式化':[170,125]};courses.forEach(c=>{if(compactPositions[c.title])[c.x,c.y]=compactPositions[c.title]});
const hasChildren=new Set((window.NETWORK_SUBNODES||[]).map(n=>n.root));
const keepExpanded=new Set(['Vibe Coding','数据日志','科学可视化','Agentic AI前沿趋势及设计案例','智能体交互设计与实践','网络数据挖掘','智能体与时尚应用','可变形模块化织物设计']);
nodes.forEach(n=>{n.level=hasChildren.has(n.id)||keepExpanded.has(n.title)?(featuredLayout[n.title]?'featured':'compact'):'dot';});

// Keep course members in local neighborhoods; the two distinct Vibe nodes stay central.
const coursePositions={'面向设计应用的人工智能基础':[720,40],
 '测控技术与仪器专业实践':[1110,545],'设计伦理：议题、历史与案例':[540,60],'社会政策':[1100,270],
 '服饰文化与跨媒介时尚设计':[215,555],
 '数据分析与可视化表达':[110,350], '人工智能与艺术设计':[600,90],
 '创意图形编程':[975,385], '数智AI时代的场景设计':[1050,145],
 '未来城市：万维社群':[840,65], '展示设计研究与创新实践':[1050,660],
 '未来场景世界观设计及综合表达':[800,705], '刺绣工艺与数智设计':[105,665],
 '装饰图案智能协同设计':[350,705], 'AI 时代的图案程式化':[230,95],
 '提花织物图案的智能设计':[455,65]
};
courses.forEach(c=>{if(coursePositions[c.title])[c.x,c.y]=coursePositions[c.title]});
const centralTitles=new Set(['Vibe Coding','Vibe Coding概述']);
const members=new Map();
nodes.forEach(n=>{
 if(centralTitles.has(n.title)){[n.x,n.y]=n.title==='Vibe Coding'?[565,330]:[565,440];return;}
 const owner=courses.find(c=>c.title===n.sourceCourse)||courses.find(c=>window.CONFIRMED_COURSE_LINKS.some(l=>l.node===n.id&&l.course===c.title));
 if(owner){n.ownerId=owner.id;if(!members.has(owner.id))members.set(owner.id,[]);members.get(owner.id).push(n);}
});
for(const [id,list] of members){
 const c=courses.find(c=>c.id===id),dx=600-c.x,dy=380-c.y,len=Math.hypot(dx,dy),ux=dx/len,uy=dy/len;
 const ordered=[...list].sort((a,b)=>(a.level==='dot'?1:0)-(b.level==='dot'?1:0));
 ordered.forEach((n,i)=>{
  const cards=ordered.filter(x=>x.level!=='dot').length;
  if(n.level!=='dot'){
   const side=(i-(cards-1)/2)*108;
   const inward=235+(i%2)*24;
   n.x=c.x+ux*inward-uy*side;n.y=c.y+uy*inward+ux*side;
  }else{
   const j=i-cards,angle=j*2.39996+Number(id.split('-')[1])*.7,r=35+Math.sqrt(j)*19;
   const inward=175+(j%4)*27;
   n.x=c.x+ux*inward+Math.cos(angle)*r;n.y=c.y+uy*inward+Math.sin(angle)*r;
  }
  n.x=Math.max(90,Math.min(1110,n.x));n.y=Math.max(60,Math.min(700,n.y));
 });
}
const avatars={'焦阳':'../network/assets/avatars/jiaoyang.jpeg','赵晓光':'../network/assets/avatars/zhaoxiaoguang.jpg','蒙克':'../network/assets/avatars/mengke.jpg','李迎军':'../network/assets/avatars/liyingjun.jpg','任续超':'../assets/ren-xuchao.png',"聂影":"../network/assets/avatars/nieying.jpg","陈洛奇":"../network/assets/avatars/chenluoqi.jpg","张红娟":"../network/assets/avatars/zhanghongjuan.jpg","王小茉":"../network/assets/avatars/wangxiaomo.jpg","金奕奕":"../network/assets/avatars/jinyiyi.png",'张松海':'../network/assets/avatars/zhangsonghai.jpg','吴琼':'../network/assets/avatars/wu.jpg','肖岚茜':'../network/assets/avatars/xiao.jpg','冯涛':'../network/assets/avatars/fengtao.jpg','师丹青':'../network/assets/avatars/shidanqing.jpg','姚妍华':'../network/assets/avatars/yao.jpg','王婧':'../network/assets/avatars/wangjing.jpg','郭玉楷':'../network/assets/avatars/guoyukai.png','董研':'../network/assets/avatars/dongyan.jpg','白鸽':'../network/assets/avatars/baige.jpg','Fabio Duarte':'../network/assets/avatars/fabio.png'};
Object.assign(avatars,{"关琰": "../network/assets/avatars/guanyan.jpg", "刘新": "../network/assets/avatars/liuxin.jpg", "唐林涛": "../network/assets/avatars/tanglintao.jpg", "张茫茫": "../network/assets/avatars/zhangmangmang.jpg", "张雷": "../network/assets/avatars/zhanglei.jpg", "杨帆": "../network/assets/avatars/yangfan.jpg", "范寅良": "../network/assets/avatars/fanyinliang.jpg", "邓岩": "../network/assets/avatars/dengyan.jpg", "陈磊": "../network/assets/avatars/chenlei.jpg", "雷磊": "../network/assets/avatars/leilei.jpg", "黄艳": "../network/assets/avatars/huangyan.jpg", "吴琼": "../network/assets/avatars/wu.jpg", "徐迎庆": "../network/assets/avatars/xuyingqing.jpg", "付志勇": "../network/assets/avatars/fuzhiyong.jpg", "米海鹏": "../network/assets/avatars/mihaipeng.jpg", "邱松": "../network/assets/avatars/qiusong.jpg"});
const departmentByTeacher={'焦阳':'新雅书院','Fabio Duarte':'MIT','张松海':'计算机系','赵晓光':'精仪系 · 为先书院','蒙克':'公管学院','郭玉楷':'软件学院'};
const departmentBadge=n=>{const labels=[...new Set((n.teacher||'').split('、').map(name=>departmentByTeacher[name]).filter(Boolean))];return labels.length?'<span class="department-badge">'+esc(labels.join(' / '))+'</span>':'';};
const hoverPerson=n=>(n.teacher||'').split('、').filter(Boolean).map(name=>{const src=avatars[name]||((n.teacher===name&&n.avatar)?'../'+n.avatar:'');return `${src?`<img src="${esc(src)}" alt="${esc(name)}">`:`<span class="initial-avatar" aria-hidden="true">${esc(name.slice(0,1))}</span>`}<span>${esc(name)}${departmentBadge({teacher:name})}</span>`;}).join('');
const person=n=>(n.displayTeacher||'').split('、').filter(Boolean).map(name=>{
 const src=avatars[name]||((n.teacher===name&&n.avatar)?'../'+n.avatar:'');
 return `<span class="overview-person">${src?`<img src="${esc(src)}" alt="${esc(name)}的头像">`:`<span class="initial-avatar" aria-hidden="true">${esc(name.slice(0,1))}</span>`}<span class="person-name">${esc(name)}${departmentBadge({teacher:name})}</span></span>`;
}).join('');
courses.find(c=>c.title==='人工智能与艺术设计').level='dot';
courses.find(c=>c.title==='AI 时代的图案程式化').level='dot';
// Show these contributors through their representative knowledge nodes.
for(const n of nodes)if(['zhaoxiaoguang-root','mengke-root','jiaoyang-root'].includes(n.id))n.level='featured';
// Allocate each contributor's visible name once; full original credits remain in details.
const creditedTitles=['媒体计算与艺术表现','科学可视化','图案的程式化','由“声”入“形”——音乐驱动的图像生成','场景内容创作'];
const seenTeachers=new Set();
const creditOrder=[...nodes.filter(n=>n.level==='featured'),...nodes.filter(n=>n.level==='compact'&&creditedTitles.includes(n.title)),...courses.filter(n=>n.level!=='dot')];
for(const n of creditOrder){
 const names=(n.teacher||'').split('、').filter(Boolean);
 // A shared node keeps its complete contributor credit even if someone appears elsewhere.
 const shown=names.length>1?names:names.filter(name=>!seenTeachers.has(name));
 n.displayTeacher=shown.join('、');shown.forEach(name=>seenTeachers.add(name));
}
for(const n of [...nodes,...courses])if(n.displayTeacher===undefined)n.displayTeacher='';
courses.find(c=>c.title==='设计伦理：议题、历史与案例').displayTeacher='王小茉';
nodes.find(n=>n.id==='wangjing-agent-interaction').displayTeacher='王婧';
nodes.find(n=>n.id==='guoyukai-network-mining').displayTeacher='郭玉楷';
nodes.find(n=>n.id==='dongyan-agent-fashion').displayTeacher='董研';
nodes.find(n=>n.id==='baige-transformable-textile').displayTeacher='白鸽';
nodes.find(n=>n.id==='submitted-020').displayTeacher='';
nodes.find(n=>n.id==='submitted-024').displayTeacher='冯涛';
// Source-listed courses stay on the perimeter; no inferred node relations.
const catalogCourses=(window.COURSE_CATALOG||[]).filter(c=>!c.existingCourse);
const catalogAnchors={'计算思维与数字媒体':[820,24],'数字媒介设计':[1090,45],'人工智能与艺术设计':[1120,640],'数字辅助设计':[1110,265],'跨媒介影像艺术':[960,725],'智能交互设计':[190,735],'智能化产品设计':[80,205],'信息技术前沿与设计应用':[200,25]};
const catalogCards=catalogCourses.filter(c=>c.level==='compact'),catalogDots=catalogCourses.filter(c=>c.level==='dot');
for(const [list,isCard] of [[catalogCards,true],[catalogDots,false]])list.forEach((c,i)=>{
 const random=k=>{const v=Math.sin((i+1)*127.1+k*311.7)*43758.5453;return v-Math.floor(v);};
 const side=i%4,depth=10+random(1)*65;
 const dotPosition=side===0?[depth,12+random(2)*736]:side===1?[1200-depth,12+random(2)*736]:side===2?[12+random(2)*1176,depth*.65]:[12+random(2)*1176,760-depth*.65];
 const anchor=isCard?catalogAnchors[c.title]:dotPosition;
 courses.push({...c,course:true,catalog:true,displayTeacher:'',catalogSide:isCard&&anchor?(anchor[0]>600?'right':'left'):null,x:anchor[0],y:anchor[1]});
});
const all=[...courses,...nodes],by=new Map(all.map(n=>[n.id,n]));
const links=window.CONFIRMED_COURSE_LINKS.map(record=>{const course=courses.find(c=>c.title===record.course);if(!course||!by.has(record.node))throw new Error('Invalid confirmed relation: '+record.node);return {from:course.id,to:record.node,type:'owns',basis:record.basis,relationship:record.relationship};});
// Weight counts only courses with confirmed membership or adoption.
const weights=new Map(nodes.map(n=>{const incoming=links.filter(l=>l.to===n.id);return [n.id,{total:new Set(incoming.map(l=>l.from)).size,actual:incoming.filter(l=>l.type==='owns').length}]}));
// Palette restored from the pre-rebuild network backup.
const edgePalette=['#4D77F1','#715CE9','#A056E5'];
// Edge emphasis describes documented content depth, not teacher rank or inferred sharing.
const contentWeights=new Map(nodes.map(n=>{
 const descendants=(window.NETWORK_SUBNODES||[]).filter(s=>s.root===n.id);
 const direct=descendants.filter(s=>s.parent===n.id).length;
 const deeper=descendants.length-direct;
 const score=direct*2+Math.min(deeper,24)*.5;
 const tier=score===0?0:score<4?1:score<8?2:score<14?3:4;
 return [n.id,{direct,deeper,tier}];
}));
links.forEach(l=>{
 const count=weights.get(l.to).total,content=contentWeights.get(l.to);
 l.width=Math.min(7,[.8,1.6,2.8,4.4,6.2][content.tier]+Math.min(count-1,2)*.65);
 l.color=({'创意图形编程':'#715CE9','展示设计研究与创新实践':'#8093AE'})[by.get(l.from).title]||edgePalette[+l.from.split('-')[1]%3];
 l.opacity=Math.min(.9,[.24,.42,.56,.72,.84][content.tier]+(count>1?.06:0));
 const courseTitle=by.get(l.from).title;
 if(courseTitle==='创意图形编程'){l.color='#715CE9';l.width=4.4+content.tier*.45;l.opacity=.86;}
 if(courseTitle==='展示设计研究与创新实践'){l.color='#92969F';l.width=.8;l.opacity=.42;}
 if(l.width>=2.8)l.width*=.8;
});
$('labels').innerHTML='';
$('items').innerHTML=all.map(n=>`<button class="item ${n.course?'course':'node'} ${n.catalog?'catalog-course':''} ${n.fullTitle?'catalog-full-title':''} ${n.related?'related':''} ${n.level} ${(n.title||'').length<=15&&(n.teacher||'').split('、').filter(Boolean).length<=1?'short-detail':''} ${n.teacher==='任续超'&&!n.course?'ren-small':''} ${['媒体计算与艺术表现','科学可视化','图案的程式化','由“声”入“形”——音乐驱动的图像生成','场景内容创作'].includes(n.title)?'credited':''}" data-id="${n.id}" data-title="${esc(n.title)}" style="left:${n.x/12}%;top:${n.y/7.6}%;--dot-color:${n.course?'#242437':'#b9add4'};--dot-size:${n.course?8:8+Math.max(0,weights.get(n.id).total-1)*6}px;--card-size:${n.course?143:128+Math.max(0,weights.get(n.id).total-1)*9}px" aria-label="${esc(n.title+'，'+(n.teacher||''))}"><span class="text"><span class="title">${esc(n.title)}</span><small class="overview-credit">${person(n)}</small><small class="hover-credit">${hoverPerson(n)}</small></span></button>`).join('');
// Homepage keeps fewer anonymous labels; fullscreen restores the complete card set.
const fullLevels=new Map(all.map(n=>[n.id,n.level]));
// Curated compact overview: keep named representatives and direct AI/digital topics.
const homepageTopics=new Set(['teacher-metaphor','liyingjun-node-01','submitted-063','submitted-021','submitted-028','submitted-079','submitted-080','submitted-083']);
const homepageCards=new Set(nodes.filter(n=>n.displayTeacher||keepExpanded.has(n.title)||homepageTopics.has(n.id)).map(n=>n.id));
// These named cards stay fully visible in fullscreen, but collapse on the compact homepage.
const overviewForcedDots=new Set(['submitted-079','wangjing-agent-interaction','dongyan-agent-fashion','baige-transformable-textile']);
const overviewExcluded=new Set(['jin-node-01','jin-node-09']);
const fullscreenTopics=new Set(['jiaoyang-02','wangxiaomo-ethics-07','wangxiaomo-ethics-10','zhaoxiaoguang-10','mengke-01','submitted-015','submitted-017','submitted-024','submitted-060','submitted-061','submitted-070','liyingjun-node-04','submitted-018','submitted-032','submitted-071','liyingjun-node-03','jin-node-06','liyingjun-node-02','submitted-068','submitted-050','jin-node-02','submitted-084']);
function syncOverviewDensity(redraw=true){
 const expanded=!!document.fullscreenElement;
 for(const n of nodes){
  const el=document.querySelector(`#items [data-id="${n.id}"]`);
  n.level=(!overviewExcluded.has(n.id)&&(!overviewForcedDots.has(n.id)||expanded)&&(homepageCards.has(n.id)||(expanded&&fullscreenTopics.has(n.id))))?(fullLevels.get(n.id)==='featured'?'featured':'compact'):'dot';
  el.classList.remove('dot','compact','featured');el.classList.add(n.level);
 }
 if(redraw){resetOverview();arrange();}
}
syncOverviewDensity(false);
function syncFullscreenButton(){
 const expanded=!!document.fullscreenElement;
 $('full').textContent=expanded?'缩小':'放大查看';
 $('full').setAttribute('aria-label',expanded?'缩小知识网络':'放大查看知识网络');
 $('full').setAttribute('aria-pressed',String(expanded));
}
syncFullscreenButton();
document.addEventListener('fullscreenchange',()=>{syncFullscreenButton();syncOverviewDensity();});
// Match the backup's single gentle arc in screen coordinates, even in a wide iframe.
function curve(l){
 const a=by.get(l.from),b=by.get(l.to),rect=$('graph').getBoundingClientRect();
 const w=rect.width||1200,h=rect.height||760,sx=w/1200,sy=h/760;
 const ax=a.x*sx,ay=a.y*sy,bx=b.x*sx,byy=b.y*sy;
 const dx=bx-ax,dy=byy-ay,len=Math.hypot(dx,dy)||1;
 const bend=Math.min(h*.23,len*.29)*(ax<w/2?1:-1);
 const cx=Math.max(14,Math.min(w-14,(ax+bx)/2-dy/len*bend));
 const cy=Math.max(14,Math.min(h-14,(ay+byy)/2+dx/len*bend));
 return `M${a.x},${a.y} Q${cx/sx},${cy/sy} ${b.x},${b.y}`;
}
function drawEdges(){ $('edges').innerHTML=links.map((l,i)=>`<path class="edge" data-edge="${i}" data-from="${l.from}" data-to="${l.to}" style="--edge-width:${l.width};--edge-color:${l.color};--edge-opacity:${l.opacity}" d="${curve(l)}"><title>${esc(l.relationship+'｜'+l.basis)}</title></path>`).join(''); }
// Open the lower-left fan and distribute art/craft topics toward the centre.
const balancedAnchors={
 'jiaoyang-root':[720,155],'mengke-root':[1080,260],'zhaoxiaoguang-root':[1080,560],
 // 师丹青的课程仍只连接材料明确列出的九个节点，但把节点带向网络中部，
 // 让编程、生成、反馈和空间交互在视觉上与其他学科发生交叉。
 'submitted-076':[790,230],'submitted-077':[745,300],'submitted-078':[800,360],
 'submitted-079':[720,455],'submitted-080':[635,385],'submitted-081':[780,525],
 'submitted-082':[875,585],'submitted-083':[860,420],'submitted-084':[875,490],
 'submitted-024':[565,430],
 'wangjing-agent-interaction':[700,410],'guoyukai-network-mining':[650,430],
 'dongyan-agent-fashion':[715,345],
 'baige-transformable-textile':[500,410],
 'submitted-054':[815,650],'zhaoxiaoguang-10':[1040,535],'mengke-01':[1025,285],
 'teacher-metaphor':[345,210],'teacher-diary':[335,320],'zhang-media':[660,660],
 'liyingjun-node-01':[420,580],'submitted-063':[300,505]
};
for(const n of nodes){
 if(balancedAnchors[n.id]){[n.x,n.y]=balancedAnchors[n.id];continue;}
 if(n.x<510&&n.y>490&&!n.displayTeacher){
  const index=nodes.indexOf(n),jitter=((index*0.61803398875)%1);
  n.x=330+jitter*420;n.y=470+((index*.381966)%1)*210;
 }
}
// Balance the composition after the latest central nodes were added: move most
// source courses and their core nodes slightly right, while keeping peripheral
// catalog dots and the user-positioned 白鸽 card fixed.
for(const n of [...courses,...nodes]){
 if(n.catalog||n.id==='baige-transformable-textile')continue;
 const shift=n.x<1020?65:n.x<1100?25:0;
 n.x=Math.min(1120,n.x+shift);
}
// Move 聂影《数智AI时代的场景设计》及其真实课程节点 left and down
// as a complete cluster, creating visual overlap with 师丹青 without inventing links.
for(const n of [...courses,...nodes]){
 if(n.title!=='数智AI时代的场景设计'&&n.sourceCourse!=='数智AI时代的场景设计')continue;
 n.x=Math.max(85,n.x-105);n.y=Math.min(700,n.y+75);
}
const original=new Map(all.map(n=>[n.id,{x:n.x,y:n.y}]));
const doctoralIds=new Set(['wangjing-agent-interaction','guoyukai-network-mining','dongyan-agent-fashion','baige-transformable-textile']);
const prominentIds=new Set([...doctoralIds,'submitted-024','jiaoyang-root','mengke-root','zhaoxiaoguang-root']);
const shiOverviewOffsets={
 'submitted-076':[-210,-120],'submitted-077':[-245,-90],'submitted-078':[-270,-55],
 'submitted-079':[-285,-20],'submitted-080':[-280,25],'submitted-081':[-255,60],
 'submitted-082':[-225,95],'submitted-083':[-190,-125],'submitted-084':[-190,-55]
};
const chenCourseNodeIds=new Set(['submitted-056','submitted-057','submitted-058']);
const jinCourseNodeIds=new Set(['jin-node-01','jin-node-02','jin-node-03','jin-node-04','jin-node-05','jin-node-06','jin-node-07','jin-node-08']);
function arrange(){
 const rect=$('graph').getBoundingClientRect(),w=rect.width,h=rect.height;if(!w||!h)return;
 const rank=n=>n.catalog?(n.level==='dot'?7:6):prominentIds.has(n.id)?0:n.course?1:centralTitles.has(n.title)?2:n.level==='dot'?5:3;
 const placed=[];const ordered=[...all].sort((a,b)=>rank(a)-rank(b));
 for(const n of ordered){
  const el=document.querySelector(`[data-id="${n.id}"]`),box=el.getBoundingClientRect();
  const bw=box.width,bh=box.height,gap=['zhaoxiaoguang-10','submitted-054','submitted-083'].includes(n.id)?24:n.catalog?2:n.level==='dot'?5:['Vibe Coding','Vibe Coding概述'].includes(n.title)?6:13;
  const origin=original.get(n.id);let ox=origin.x/1200*w,oy=origin.y/760*h;
  // On the embedded overview, lightly gather each course's small points toward
  // their documented owner. Fullscreen retains the existing, roomier layout.
  if(!document.fullscreenElement&&shiOverviewOffsets[n.id]&&n.ownerId){
   const ownerEl=document.querySelector(`#items [data-id="${n.ownerId}"]`),ownerBox=ownerEl?.getBoundingClientRect();
   if(ownerBox){
    const [dx,dy]=shiOverviewOffsets[n.id];
    ox=ownerBox.left-rect.left+ownerBox.width/2+dx/1200*w;
    oy=ownerBox.top-rect.top+ownerBox.height/2+dy/760*h;
   }
  }else if(!document.fullscreenElement&&n.ownerId){
   const ownerOrigin=original.get(n.ownerId);
   if(ownerOrigin){
    const ownerX=ownerOrigin.x/1200*w,ownerY=ownerOrigin.y/760*h;
    // Text cards move only a little; the unusually distant media-computing
    // card needs a stronger correction toward 吴琼's documented course root.
    const gather=n.id==='zhang-media'?.52:n.id==='jin-node-03'?.72:jinCourseNodeIds.has(n.id)?.42:chenCourseNodeIds.has(n.id)?.48:n.level==='dot'?.28:.16;
    ox=ox*(1-gather)+ownerX*gather;oy=oy*(1-gather)+ownerY*gather;
   }
  }
  if(!document.fullscreenElement&&n.ownerId){
   const ownerEl=document.querySelector(`#items [data-id="${n.ownerId}"]`),ownerBox=ownerEl?.getBoundingClientRect();
   if(ownerBox){
    const ownerX=ownerBox.left-rect.left+ownerBox.width/2,ownerY=ownerBox.top-rect.top+ownerBox.height/2;
    const dx=ox-ownerX,dy=oy-ownerY,distance=Math.hypot(dx,dy);
    const maxDistance=Math.min(230,Math.max(150,Math.min(w*.2,h*.55)));
    if(distance>maxDistance){const scale=maxDistance/distance;ox=ownerX+dx*scale;oy=ownerY+dy*scale;}
   }
  }
  const fits=(x,y)=>(!n.catalog||n.level!=='dot'||x<w*.1||x>w*.9||y<h*.1||y>h*.9)&&(!n.catalogSide||(n.catalogSide==='right'?x>w*.54:x<w*.46))&&x>=bw/2+3&&x<=w-bw/2-3&&y>=bh/2+3&&y<=h-bh/2-3&&!placed.some(p=>Math.abs(x-p.x)<(bw+p.w)/2+gap&&Math.abs(y-p.y)<(bh+p.h)/2+gap);
  let found=null;
  for(let radius=0;radius<Math.max(w,h)&&!found;radius+=6){const steps=Math.max(1,Math.ceil(radius/3));for(let j=0;j<steps;j++){let angle=j/steps*Math.PI*2,x=ox+Math.cos(angle)*radius,y=oy+Math.sin(angle)*radius;if(fits(x,y)){found={x,y};break}}}
  if(!found)found={x:Math.max(bw/2,Math.min(w-bw/2,ox)),y:Math.max(bh/2,Math.min(h-bh/2,oy))};
  n.x=found.x/w*1200;n.y=found.y/h*760;el.style.left=n.x/12+'%';el.style.top=n.y/7.6+'%';placed.push({...found,w:bw,h:bh});
 }
 // Keep the small “数据与生成” card inside 师丹青's left-side fan, freeing
 // the lower middle area for 陈洛奇's two-card cluster.
 if(!document.fullscreenElement){
  const el=document.querySelector('#items [data-id="submitted-083"]'),owner=document.querySelector('#items [data-title="创意图形编程"]');
  if(el&&owner){const box=el.getBoundingClientRect(),root=owner.getBoundingClientRect(),cx=root.left-rect.left+root.width/2,cy=root.top-rect.top+root.height/2;const obstacles=[...document.querySelectorAll('#items .item:not(.dot)')].filter(other=>other!==el).map(other=>{const r=other.getBoundingClientRect();return {l:r.left-rect.left-7,r:r.right-rect.left+7,t:r.top-rect.top-7,b:r.bottom-rect.top+7};});let spot=null;for(let radius=90;radius<=280&&!spot;radius+=10)for(let k=-8;k<=8;k++){const angle=Math.PI+k*.08,x=cx+Math.cos(angle)*radius,y=cy+Math.sin(angle)*radius;if(x-box.width/2>4&&x+box.width/2<w-4&&y-box.height/2>4&&y+box.height/2<h-4&&!obstacles.some(o=>x+box.width/2>o.l&&x-box.width/2<o.r&&y+box.height/2>o.t&&y-box.height/2<o.b)){spot={x,y};break;}}if(spot){const node=by.get('submitted-083');node.x=spot.x/w*1200;node.y=spot.y/h*760;el.style.left=node.x/12+'%';el.style.top=node.y/7.6+'%';}}
 }
 // Keep 陈洛奇's two visible cards together after global collision avoidance;
 // otherwise a short iframe can push them to opposite sides of the network.
 if(!document.fullscreenElement){
  const anchorEl=document.querySelector('#items [data-id="submitted-056"]'),movingEl=document.querySelector('#items [data-id="submitted-057"]');
  if(anchorEl&&movingEl){
   const anchor=anchorEl.getBoundingClientRect(),moving=movingEl.getBoundingClientRect();
   const ax=anchor.left-rect.left+anchor.width/2,ay=anchor.top-rect.top+anchor.height/2;
   const mx=moving.left-rect.left+moving.width/2,my=moving.top-rect.top+moving.height/2;
   const obstacles=[...document.querySelectorAll('#items .item:not(.dot)')].filter(el=>el!==anchorEl&&el!==movingEl).map(el=>{const r=el.getBoundingClientRect();return {l:r.left-rect.left-8,r:r.right-rect.left+8,t:r.top-rect.top-8,b:r.bottom-rect.top+8};});
   const layouts=[{a:{x:-(anchor.width/2+7),y:0},b:{x:moving.width/2+7,y:0}},{a:{x:0,y:-(anchor.height/2+7)},b:{x:0,y:moving.height/2+7}}];
   let best=null;
   const clear=(x,y,bw,bh)=>x-bw/2>4&&x+bw/2<w-4&&y-bh/2>4&&y+bh/2<h-4&&!obstacles.some(o=>x+bw/2>o.l&&x-bw/2<o.r&&y+bh/2>o.t&&y-bh/2<o.b);
   for(const layout of layouts)for(let y=36;y<h-36;y+=8)for(let x=76;x<w-76;x+=8){const a={x:x+layout.a.x,y:y+layout.a.y},b={x:x+layout.b.x,y:y+layout.b.y};if(!clear(a.x,a.y,anchor.width,anchor.height)||!clear(b.x,b.y,moving.width,moving.height))continue;const score=Math.hypot(x-(ax+mx)/2,y-(ay+my)/2);if(!best||score<best.score)best={a,b,score};}
   if(best){const first=by.get('submitted-056'),second=by.get('submitted-057');first.x=best.a.x/w*1200;first.y=best.a.y/h*760;second.x=best.b.x/w*1200;second.y=best.b.y/h*760;anchorEl.style.left=first.x/12+'%';anchorEl.style.top=first.y/7.6+'%';movingEl.style.left=second.x/12+'%';movingEl.style.top=second.y/7.6+'%';const dot=by.get('submitted-058'),dotEl=document.querySelector('#items [data-id="submitted-058"]');dot.x=((best.a.x+best.b.x)/2)/w*1200;dot.y=((best.a.y+best.b.y)/2-18)/h*760;dotEl.style.left=dot.x/12+'%';dotEl.style.top=dot.y/7.6+'%';}
  }
 }
 // Collision avoidance can move cards after their course root was placed.
 // On the compact overview, relocate every black course dot beside the final
 // on-screen node cluster so roots never remain stranded across the canvas.
 if(!document.fullscreenElement){
  for(const course of courses.filter(c=>!c.catalog&&c.level==='dot')){
   const owned=nodes.filter(n=>n.ownerId===course.id),visible=owned.filter(n=>n.level!=='dot');
   const anchors=(visible.length?visible:owned).map(n=>{const el=document.querySelector(`#items [data-id="${n.id}"]`),r=el?.getBoundingClientRect();return r?{x:r.left-rect.left+r.width/2,y:r.top-rect.top+r.height/2}:null}).filter(Boolean);
   if(!anchors.length)continue;
   const target={x:anchors.reduce((s,p)=>s+p.x,0)/anchors.length,y:anchors.reduce((s,p)=>s+p.y,0)/anchors.length};
   const el=document.querySelector(`#items [data-id="${course.id}"]`);
   const obstacles=[...document.querySelectorAll('#items .item')].filter(other=>other!==el).map(other=>{const r=other.getBoundingClientRect();return {l:r.left-rect.left-6,r:r.right-rect.left+6,t:r.top-rect.top-6,b:r.bottom-rect.top+6};});
   let spot=null;
   for(let radius=16;radius<=130&&!spot;radius+=8)for(let k=0;k<24;k++){const angle=k*Math.PI/12,x=target.x+Math.cos(angle)*radius,y=target.y+Math.sin(angle)*radius;if(x>8&&x<w-8&&y>8&&y<h-8&&!obstacles.some(o=>x>o.l&&x<o.r&&y>o.t&&y<o.b)){spot={x,y};break;}}
   if(!spot)spot={x:Math.max(8,Math.min(w-8,target.x)),y:Math.max(8,Math.min(h-8,target.y))};
   course.x=spot.x/w*1200;course.y=spot.y/h*760;el.style.left=course.x/12+'%';el.style.top=course.y/7.6+'%';
  }
 }
 drawEdges();drawSubnodes();
}
const subnodes=window.NETWORK_SUBNODES||[];
const satelliteLayer=document.createElement('div');satelliteLayer.id='subnodes';$('graph').append(satelliteLayer);
let expandedObstacle=null;
function drawSubnodes(){
 document.querySelectorAll('.subedge').forEach(el=>el.remove());
 const bounds=$('graph').getBoundingClientRect(),w=bounds.width,h=bounds.height;
 const lineCells=new Set(),cell=8;
 document.querySelectorAll('.edge').forEach(path=>{
  if(Number(path.style.getPropertyValue('--edge-width'))<2)return;
  const length=path.getTotalLength();
  for(let t=0;t<=length;t+=5){const pt=path.getPointAtLength(t),cx=Math.floor(pt.x/1200*w/cell),cy=Math.floor(pt.y/760*h/cell);for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)lineCells.add((cx+dx)+','+(cy+dy));}
 });
 const obstacles=[...document.querySelectorAll('#items .item')].map(el=>{const r=el.getBoundingClientRect();return {x:r.left-bounds.left,y:r.top-bounds.top,w:r.width,h:r.height}});
 // Measure real expanded typography, including wrapping and contributor portraits.
 const expandedBounds=new Map();
 for(const id of hasChildren){
  const el=document.querySelector(`#items [data-id="${id}"]`);if(!el)continue;
  const clone=el.cloneNode(true);clone.removeAttribute('data-id');clone.classList.add('reveal');clone.style.visibility='hidden';clone.style.pointerEvents='none';clone.style.removeProperty('--hover-x');clone.style.removeProperty('--hover-y');$('items').append(clone);
  const r=clone.getBoundingClientRect();clone.remove();
  expandedBounds.set(id,{x:Math.max(0,Math.min(w-r.width,r.left-bounds.left)),y:Math.max(0,Math.min(h-r.height,r.top-bounds.top)),w:r.width,h:r.height});
 }
 let rootBox=null;
 const placed=new Map(all.map(n=>[n.id,{x:n.x/1200*w,y:n.y/760*h}])),dots=[],paths=[];
 const fits=(x,y)=>!lineCells.has(Math.floor(x/cell)+','+Math.floor(y/cell))&&(!rootBox||x<rootBox.x-10||x>rootBox.x+rootBox.w+10||y<rootBox.y-10||y>rootBox.y+rootBox.h+10)&&x>7&&x<w-7&&y>7&&y<h-7&&!obstacles.some(r=>x>r.x-5&&x<r.x+r.w+5&&y>r.y-5&&y<r.y+r.h+5)&&!dots.some(d=>Math.hypot(d.x-x,d.y-y)<7);
 const siblings=new Map(),direction=new Map();
 subnodes.forEach(n=>{if(!siblings.has(n.parent))siblings.set(n.parent,[]);siblings.get(n.parent).push(n)});
 const ordered=[...subnodes].sort((a,b)=>a.number.split('.').length-b.number.split('.').length);
 for(const n of ordered){
  const root=by.get(n.root),parent=placed.get(n.parent)||placed.get(n.root);if(!root||!parent)continue;
  rootBox=expandedBounds.get(n.root);
  const family=siblings.get(n.parent),index=family.indexOf(n);
  const parentEl=document.querySelector(`#items [data-id="${n.parent}"]`),box=expandedBounds.get(n.parent)||parentEl?.getBoundingClientRect();
  const clearance=angle=>box?Math.min(((box.w||box.width)/2+17)/Math.max(.001,Math.abs(Math.cos(angle))),((box.h||box.height)/2+17)/Math.max(.001,Math.abs(Math.sin(angle)))):17;
  if(!direction.has(n.parent)){
   let best=-Infinity,chosen=0;
   for(let k=0;k<24;k++){
    const angle=k*Math.PI/12;let score=0;
    for(let j=0;j<family.length;j++){
     const a=angle+(j-(family.length-1)/2)*.24,r=clearance(a)+12;
     if(fits(parent.x+Math.cos(a)*r,parent.y+Math.sin(a)*r))score+=3;
    }
    if(score>best){best=score;chosen=angle;}
   }
   direction.set(n.parent,chosen);
  }
  const desired=direction.get(n.parent)+(index-(family.length-1)/2)*Math.min(.35,1.6/Math.max(1,family.length-1));
  let point=null,bestScore=Infinity;
  for(let ring=0;ring<13;ring++)for(let step=0;step<25;step++){
   const offset=(step%2?1:-1)*Math.ceil(step/2)*Math.PI/24,angle=desired+offset,r=clearance(angle)+ring*8;
   const x=parent.x+Math.cos(angle)*r,y=parent.y+Math.sin(angle)*r;
   const score=ring*8+Math.abs(offset)*24;
   if(score<bestScore&&fits(x,y)){bestScore=score;point={x,y};direction.set(n.id,angle);}
  }
  if(!point)for(let radius=20;radius<240&&!point;radius+=8)for(let k=0;k<48;k++){const angle=desired+k*Math.PI/24,x=parent.x+Math.cos(angle)*radius,y=parent.y+Math.sin(angle)*radius;if(fits(x,y)){point={x,y};direction.set(n.id,angle);break}}
  if(!point)continue;
  placed.set(n.id,point);dots.push({...n,...point});
  const mx=(parent.x+point.x)/2,my=(parent.y+point.y)/2-5;
  paths.push(`<path class="subedge" data-root="${n.root}" d="M${parent.x/w*1200},${parent.y/h*760} Q${mx/w*1200},${my/h*760} ${point.x/w*1200},${point.y/h*760}"/>`);
 }
 $('edges').insertAdjacentHTML('afterbegin',paths.join(''));
 satelliteLayer.innerHTML=dots.map(n=>{const root=by.get(n.root);return `<button class="subnode" data-root="${n.root}" data-subid="${n.id}" style="left:${n.x}px;top:${n.y}px" aria-label="${esc(n.title+'，'+root.title)}"><span class="subcard"><span class="subparent">${esc(root.title)}</span><strong>${esc(n.title)}</strong><small>${hoverPerson(root)}</small></span></button>`}).join('');
 satelliteLayer.querySelectorAll('.subnode').forEach(el=>{
  const show=()=>{focus(el.dataset.root,false);el.classList.add('show');const card=el.querySelector('.subcard'),r=card.getBoundingClientRect();card.style.setProperty('--shift-x',(r.left<bounds.left?bounds.left-r.left:r.right>bounds.right?bounds.right-r.right:0)+'px');card.style.setProperty('--shift-y',(r.top<bounds.top?bounds.top-r.top:r.bottom>bounds.bottom?bounds.bottom-r.bottom:0)+'px');};
  const hide=()=>{el.classList.remove('show');focus(null)};
  el.onpointerenter=show;el.onpointerleave=hide;el.onfocus=show;el.onblur=hide;
  el.onclick=e=>{e.stopPropagation();const root=by.get(el.dataset.root);if(parent===window)location.href='../node.html?id='+encodeURIComponent(root.id);else window.parent.postMessage({type:'atomic-page-open',kind:'node',id:root.id,title:root.title},'*');};
 });
}
const previewPositions=new Map();
function restorePreviewPositions(){
 for(const [id,pos] of previewPositions){const n=by.get(id);Object.assign(n,pos);const el=document.querySelector(`#items [data-id="${id}"]`);el.style.left=n.x/12+'%';el.style.top=n.y/7.6+'%';}
 previewPositions.clear();
}
function refreshEdgePaths(){document.querySelectorAll('.edge').forEach(el=>el.setAttribute('d',curve(links[Number(el.dataset.edge)])));}
// Reveal only a few owned dots that have room for a short label in place.
function previewCourseNodes(id){
 if(!by.get(id)?.course)return;
 const bounds=$('graph').getBoundingClientRect();
 const expanded=!!document.fullscreenElement;
 const limit=expanded?3:2;
 const owner=by.get(id);
 const collaborative=n=>(n.teacher||'').split('、').filter(Boolean).some(name=>name!==owner.teacher);
 const preferred=n=>['liyingjun-node-02','liyingjun-node-03','submitted-060','submitted-071'].includes(n.id);
 const candidates=links.filter(l=>l.from===id).map(l=>by.get(l.to)).filter(n=>!overviewExcluded.has(n.id));
 candidates.sort((a,b)=>Number(preferred(b))-Number(preferred(a))||Number(collaborative(b))-Number(collaborative(a))||contentWeights.get(b.id).tier-contentWeights.get(a.id).tier||a.title.length-b.title.length);
 let count=0;
 for(const n of candidates){
  const alreadyVisible=n.level!=='dot';
  const required=collaborative(n)||preferred(n)||alreadyVisible;
  if(!required&&count>=limit)continue;
  const el=document.querySelector(`#items [data-id="${n.id}"]`);
  if(!alreadyVisible)el.classList.add('course-preview');
  el.classList.toggle('collaborative-preview',!alreadyVisible&&(collaborative(n)||preferred(n)));
  const origin={x:n.x,y:n.y},gap=expanded?5:3;
 const obstacles=[...document.querySelectorAll('#items .item')].filter(other=>other!==el&&(!required||!other.classList.contains('dim'))).map(other=>other.getBoundingClientRect());
  let found=false;
  for(let radius=0;radius<=(required?Math.hypot(bounds.width,bounds.height):(expanded?96:144))&&!found;radius+=12){
   const steps=radius?16:1;
   for(let j=0;j<steps;j++){
    const angle=j/steps*Math.PI*2;
    n.x=origin.x+Math.cos(angle)*radius/bounds.width*1200;n.y=origin.y+Math.sin(angle)*radius/bounds.height*760;
    el.style.left=n.x/12+'%';el.style.top=n.y/7.6+'%';
    const box=el.getBoundingClientRect();
    const blocked=box.left<bounds.left+4||box.right>bounds.right-4||box.top<bounds.top+4||box.bottom>bounds.bottom-4||obstacles.some(r=>box.left<r.right+gap&&box.right>r.left-gap&&box.top<r.bottom+gap&&box.bottom>r.top-gap);
    if(!blocked){found=true;break;}
   }
  }
  if(found){previewPositions.set(n.id,origin);if(!alreadyVisible)count++;
   if(required){const box=el.getBoundingClientRect();document.querySelectorAll('#items .item.dim').forEach(other=>{const r=other.getBoundingClientRect();if(box.left<r.right+gap&&box.right>r.left-gap&&box.top<r.bottom+gap&&box.bottom>r.top-gap)other.classList.add('preview-covered');});}
  }
  else{Object.assign(n,origin);el.style.left=n.x/12+'%';el.style.top=n.y/7.6+'%';el.classList.remove('course-preview','collaborative-preview');}
 }
}
let resizeTimer;new ResizeObserver(()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(arrange,80)}).observe($('graph'));requestAnimationFrame(arrange);let selected=null;function focus(id,expand=true){restorePreviewPositions();const visible=new Set(),active=new Set();if(id){visible.add(id);links.forEach((l,i)=>{if(l.from===id||l.to===id){visible.add(l.from);visible.add(l.to);active.add(i)}});}
 document.querySelectorAll('.item').forEach(el=>{el.classList.remove('course-preview','collaborative-preview','preview-covered');el.classList.toggle('dim',!!id&&!visible.has(el.dataset.id));el.classList.toggle('reveal',expand&&el.dataset.id===id);el.style.removeProperty('--hover-x');el.style.removeProperty('--hover-y')});document.querySelectorAll('.edge').forEach((el,i)=>{el.classList.toggle('faint',!!id&&!active.has(i));el.classList.toggle('active',active.has(i))});
 if(id){const el=document.querySelector(`[data-id="${id}"]`),b=el.getBoundingClientRect(),r=$('graph').getBoundingClientRect();el.style.setProperty('--hover-x',(b.left<r.left?r.left-b.left:b.right>r.right?r.right-b.right:0)+'px');el.style.setProperty('--hover-y',(b.top<r.top?r.top-b.top:b.bottom>r.bottom?r.bottom-b.bottom:0)+'px');}
 if(expand)previewCourseNodes(id);
 refreshEdgePaths();
 const nextObstacle=expand?id:null;if(nextObstacle!==expandedObstacle){expandedObstacle=nextObstacle;drawSubnodes();}
 // Each descendant retains its top-level root, covering every nested depth.
 satelliteLayer.querySelectorAll('.subnode').forEach(el=>{const related=!!id&&visible.has(el.dataset.root);el.classList.toggle('dim',!!id&&!related);el.classList.toggle('branch-active',related)});
 document.querySelectorAll('.subedge').forEach(el=>{const related=!!id&&visible.has(el.dataset.root);el.classList.toggle('dim',!!id&&!related);el.classList.toggle('branch-active',related)});

}
document.querySelectorAll('.item').forEach(el=>{el.addEventListener('pointerenter',()=>focus(el.dataset.id));el.addEventListener('pointerleave',()=>focus(null));el.addEventListener('focus',()=>focus(el.dataset.id));el.addEventListener('blur',()=>focus(null));el.addEventListener('click',event=>{event.stopPropagation();const n=by.get(el.dataset.id);const message={type:'atomic-page-open',kind:n.catalog?'catalog':n.course?'course':'node',id:n.catalog?n.id:n.course?n.title:n.id,title:n.title};if(parent===window)location.href='../node.html?'+(n.catalog?'catalog=':n.course?'course=':'id=')+encodeURIComponent(message.id);else { if(document.fullscreenElement)document.exitFullscreen(); parent.postMessage(message,'*'); }});});
function resetOverview(){selected=null;if(document.activeElement?.matches('.item'))document.activeElement.blur();focus(null);}
document.addEventListener('click',e=>{if(!e.target.closest('button,a'))resetOverview();});
$('full').onclick=()=>document.fullscreenElement?document.exitFullscreen():document.documentElement.requestFullscreen();document.addEventListener('keydown',e=>{if(e.key==='Escape')resetOverview();});
focus(null);
})();
