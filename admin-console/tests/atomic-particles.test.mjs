import test from 'node:test';
import assert from 'node:assert/strict';
import {atomicCardState,atomicNetworkGraph,atomicNetworkKey} from '../src/morph/atomicParticlesModel.js';
import {readFile,access} from 'node:fs/promises';
import {courseResources,filterCourseResources,atomicContentLabel} from '../src/morph/learningCatalogModel.js';

test('统一课程目录保留同名资源的独立身份及真实进度，不按标题覆盖',()=>{
 const resources=courseResources([{id:'legacy-color',title:'色彩',category:'设计基础',availability:'trial',progressPercent:67}],[{id:'atom-color',revision:2,kind:'course',status:'published',title:'色彩',required:3,completed:0,started:false}]);
 assert.equal(resources.length,2);assert.equal(new Set(resources.map(r=>r.key)).size,2);assert.equal(resources.find(r=>r.type==='legacy').progress,67);assert.equal(resources.find(r=>r.type==='atomic').progress,0);
});
test('课程分类数量随开放状态与搜索变化，不再以全部目录计数冒充筛选数量',()=>{
 const resources=courseResources([{id:'open',title:'配色',category:'设计基础',availability:'trial'},{id:'planned',title:'图表',category:'设计方法',availability:'coming_soon'}],[]);
 assert.deepEqual(filterCourseResources(resources,{availability:'available'}).facets,{'设计基础':1});assert.deepEqual(filterCourseResources(resources,{availability:'planned'}).facets,{'设计方法':1});assert.equal(filterCourseResources(resources,{availability:'all',query:'配色'}).total,1);assert.equal(filterCourseResources(resources,{availability:'available',stage:'completed'}).total,0);
 assert.equal(atomicContentLabel({id:'morph-handoff-atom-example',kind:'teaching'}),'知识大纲');
});

test('系列课程保留10次课、19处课程节点和全部34处下级知识内容',async()=>{
 const template=JSON.parse(await readFile(new URL('../src/morph/handoffSeriesTemplate.json',import.meta.url),'utf8'));
 const nodes=[];const visit=n=>{if(typeof n==='string')return;nodes.push(n);n.children.forEach(visit);};visit(template);
 assert.equal(nodes.filter(n=>n.props.className==='lesson-session').length,10);
 assert.equal(nodes.filter(n=>n.props.className==='lesson-topic').length,19);
 assert.equal(nodes.filter(n=>n.props['data-point']==='true').length,34);
 assert.ok(nodes.every(n=>!['script','iframe','object'].includes(n.tag)&&!Object.keys(n.props).some(k=>/^on/i.test(k))));
 for(const n of nodes.filter(n=>n.tag==='img')){assert.ok(n.props.src.startsWith('/morph-course-network/series/'));await access(new URL('../public'+n.props.src,import.meta.url));}
});

test('交接课程网保留原始三处课程锚点、原图连线与13个交互入口',async()=>{
 const template=JSON.parse(await readFile(new URL('../src/morph/atomicReferenceNetwork.json',import.meta.url),'utf8'));
 const nodes=[];const walk=node=>{if(typeof node==='string')return;nodes.push(node);node.children.forEach(walk);};walk(template);
 assert.equal(nodes.filter(n=>['a','button'].includes(n.tag)).length,13);
 const expected=[['数据分析与可视化表达','72px','192px'],['人工智能与艺术设计','556px','36px'],['交互艺术设计研究','952px','288px']];
 for(const [title,left,top] of expected){const node=nodes.find(n=>n.props['data-name']===title);assert.ok(node,title);assert.equal(node.props.style.left,left);assert.equal(node.props.style.top,top);}
 const graph=nodes.find(n=>n.props.className==='knowledge-graph');assert.equal(graph.props.style.width,'1204px');assert.equal(graph.props.style.height,'500px');
 assert.equal(graph.props.style.backgroundColor,'rgb(244, 241, 255)');
 assert.ok(nodes.some(n=>n.tag==='img'&&n.props.src.endsWith('/network-img2.svg')));
 for(const node of nodes){assert.ok(['div','section','p','a','button','img','span','strong','small'].includes(node.tag));assert.ok(!Object.keys(node.props).some(key=>/^on/i.test(key)));if(node.tag==='img'){assert.match(node.props.src,/^\/morph-course-network\/strict\/[a-zA-Z0-9.-]+$/);await access(new URL('../public'+node.props.src,import.meta.url));}}
});

test('实际学习状态驱动卡片，阅读与待评价不冒充完成',()=>{
 const atom={id:'a',revision:2,kind:'teaching',status:'published'};
 assert.equal(atomicCardState(atom).label,'未开始');
 for(const stage of ['read','submitted','needs_revision']){
  const result=atomicCardState({...atom,stage});assert.equal(result.percent,0);assert.equal(result.action,'继续学习');
 }
 assert.equal(atomicCardState({...atom,stage:'completed'}).percent,100);
 assert.equal(atomicCardState({...atom,status:'pending_review'}).label,'审核中');
 assert.equal(atomicCardState({...atom,kind:'course',required:3,completed:2,started:true}).percent,67);
 assert.equal(atomicCardState({...atom,kind:'course',required:0,completed:0}).percent,0);
});
test('网络保留共享、先修、心得分支及精确版本',()=>{
 const atom={id:'a',revision:1,publishedRevision:2,kind:'teaching',title:'同名原子'};
 const latest={...atom,revision:2},other={id:'b',revision:1,kind:'teaching',title:'同名原子'};
 const first={id:'c1',revision:1,kind:'course',steps:[{atomId:'a',revision:1},{atomId:'b',revision:1,prerequisites:['a']}]};
 const second={id:'c2',revision:2,kind:'course',steps:[{atomId:'a',revision:1}]};
 const reflection={id:'r',revision:1,kind:'reflection',parentId:'a'};
 const graph=atomicNetworkGraph([atom,latest,other,first,second,reflection]);
 assert.equal(graph.nodes.length,6);assert.equal(graph.edges.length,5);
 assert.equal(graph.nodes.find(n=>n.id==='a@1').data.shared,2);
 assert.ok(graph.edges.some(e=>e.source==='a@1'&&e.target==='b@1'&&e.data.kind==='prerequisite'));
 assert.ok(graph.edges.some(e=>e.source==='a@2'&&e.target==='r@1'&&e.data.kind==='reflection'));
 assert.ok(!graph.edges.some(e=>e.source==='a@1'&&e.target==='a@2'));
 const selected=atomicNetworkGraph([atom,latest,other,first,second,reflection],atomicNetworkKey(first));
 assert.equal(selected.nodes.length,3);assert.ok(!selected.nodes.some(n=>n.id==='a@2'||n.id==='r@1'));
});
test('空网络和缺失版本安全降级，同名原子不会制造关联',()=>{
 assert.deepEqual(atomicNetworkGraph([]),{nodes:[],edges:[],courses:[]});
 const graph=atomicNetworkGraph([{id:'a',revision:1,kind:'teaching',title:'色彩'},{id:'b',revision:1,kind:'teaching',title:'色彩'},{id:'c',revision:1,kind:'course',steps:[{atomId:'a',revision:99}]}]);
 assert.equal(graph.edges.length,0);
});
