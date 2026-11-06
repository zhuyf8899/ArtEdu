// Curated sample and fixed display coordinates. This is not an inferred learning route.
export const pilotGroups=[
 {id:'thinking',title:'设计思考',color:'#8069d9',x:235,y:225,titles:['设计的目的','日常用品观察','质疑与反思','问题重构','联想与发散','系统与综合']},
 {id:'research',title:'用户研究',color:'#488d9b',x:700,y:185,titles:['用户观察','访谈与旅程','用户需求','场景与问题界定','产品目标','内容需求与优先级']},
 {id:'information',title:'信息组织',color:'#b27d45',x:1140,y:375,titles:['信息架构','信息层级','图文组织','视觉层级','网格','留白']},
 {id:'visual',title:'视觉表达',color:'#c16f93',x:885,y:725,titles:['色相','明度','饱和度','配色角色','字体应用','字体与标题']},
 {id:'interaction',title:'交互验证',color:'#638e63',x:350,y:705,titles:['目标与任务','情境场景','交互框架','界面与导航','原型与测试','可用性与概念评估']},
];
const ids={"设计的目的": "knowledge-label-12dfddb111944bf6f07da26c6126a303", "日常用品观察": "knowledge-label-d36582cdf06aee40fbd5e02b984a4a32", "质疑与反思": "knowledge-label-bc3df5b4cc563f86e6f558ceef0371ca", "问题重构": "knowledge-label-b84c4982cf3a7727cd8d1cd14194bf4a", "联想与发散": "knowledge-label-ce90bc93ce30893e7f40cd66ea065e35", "系统与综合": "knowledge-label-17a7542f014f68579aaa2839b63fe0ff", "用户观察": "knowledge-label-36d7c3d21a4828c92a14d589d36e3148", "访谈与旅程": "knowledge-label-52c2b59653c5ff82a446b372bd937375", "用户需求": "knowledge-label-970ccd9e6ce3798a484ba7f6004b1c1a", "场景与问题界定": "knowledge-label-152f9b7465df2964411d6ebef3bbe43b", "产品目标": "knowledge-label-24ab31491f1403f61722fef2641600c4", "内容需求与优先级": "knowledge-label-052138fa0f728e6a9a08ce90b49e372c", "信息架构": "knowledge-label-75897577c426cb80b3f837fe760a1789", "信息层级": "knowledge-label-81ed2a3a13e7bc1e77a4a6e0a85068b0", "图文组织": "knowledge-label-6255fdf19e696bff525cf51cdcfd7c95", "视觉层级": "knowledge-label-5b4c0360f8ed7c535afd91ec615bedf4", "网格": "knowledge-label-16bf955c22835b6acbc202bd2738b50c", "留白": "knowledge-label-2ba1d6598bc7b375c05efa8e0e710889", "色相": "knowledge-label-8b232299faf2d15f457718775fd61980", "明度": "knowledge-label-ad2eab72a3528f0753013c6df019e1fe", "饱和度": "knowledge-label-bd05021dc9663a44921852bf27661ae1", "配色角色": "knowledge-label-c3206e439f0670033e3c53fe31393f8b", "字体应用": "knowledge-label-337e393579d62fde251eeb3c63c0697b", "字体与标题": "knowledge-label-57b988e08417963c3b33eb430d824b6b", "目标与任务": "knowledge-label-8e0ca143aae17c110fd3f8e607ccb98f", "情境场景": "knowledge-label-97b72bad1e58a0099c31fd726de18a87", "交互框架": "knowledge-label-1fdcce7b8ea25592de3f30b396bbd236", "界面与导航": "knowledge-label-7bbd8c3cee95fd9b0cf6a48e0308b2f8", "原型与测试": "knowledge-label-db6a01ac524160f1824802b4302546de", "可用性与概念评估": "knowledge-label-07e50d3f62134282228641960ebb7360"};
const offsets=[[-115,-60],[0,-120],[115,-60],[115,65],[0,125],[-115,65]];
const labels={
 '设计的目的':['目标定义','基础'],'问题重构':['问题分析','方法'],'联想与发散':['创意生成'],
 '用户观察':['观察','研究方法'],'用户需求':['需求分析'],'场景与问题界定':['情境','问题分析'],
 '信息架构':['信息组织'],'视觉层级':['视觉组织','可读性'],
 '配色角色':['色彩','视觉表达'],'字体应用':['字体','可读性'],
 '原型与测试':['原型','验证'],'可用性与概念评估':['用户评估','验证'],
};
export const pilotNodes=pilotGroups.flatMap(group=>group.titles.map((title,i)=>({id:ids[title],title,group:group.id,x:group.x+offsets[i][0],y:group.y+offsets[i][1],tags:labels[title]??[]})));
const rings=pilotGroups.flatMap(group=>group.titles.map((title,i)=>[title,group.titles[(i+1)%6]]));
export const pilotLinks=[...rings,
 ['设计的目的','问题重构'],['用户观察','场景与问题界定'],['信息架构','视觉层级'],['色相','配色角色'],['目标与任务','界面与导航'],
 ['日常用品观察','用户观察'],['设计的目的','产品目标'],['问题重构','场景与问题界定'],['系统与综合','信息架构'],
 ['用户需求','目标与任务'],['访谈与旅程','情境场景'],['内容需求与优先级','信息层级'],['产品目标','原型与测试'],
 ['信息架构','界面与导航'],['图文组织','字体与标题'],['视觉层级','配色角色'],['留白','字体应用'],
 ['字体应用','界面与导航'],['配色角色','原型与测试'],['可用性与概念评估','问题重构'],['可用性与概念评估','视觉层级'],
];
