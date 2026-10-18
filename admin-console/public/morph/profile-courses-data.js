/* Personal learning data rendered by the SAME course-card component as atomic courses. */
(()=>{const base=window.MORPH_DATA.courses;const records=[
['GEN-04','生成式设计方法','苏予安 · 智能设计交叉实验室 · 生成式设计','下一节：风格一致性实验',67,'4/6 单元 · 今日更新',0],
['IXD-02','交互原型实践','苏予安 · 智能人机交互工程组 · 交互叙事','下一节：状态与反馈',40,'2/5 单元 · 2天前',2],
['SHD-03','实时着色器与材质计算','顾清言 · 计算图形实验室 · 3D 视觉','下一节：次表面散射与透光模拟',43,'3/7 单元 · 3天前',4],
['GEO-06','三维空间几何与拓扑布线','许景行 · 空间计算系 · 3D 视觉','已全部完成 · 获得优秀结课认证',100,'6/6 单元 · 上个月',8],
['PSY-04','设计心理学与多感官通道','周若宁 · 认知体验组 · 交互叙事','已全部完成 · 结课成果《触觉映射研究》',100,'4/4 单元 · 2个月前',1]
];window.MORPH_DATA.courses=records.map(([code,title,teacher,next,progress,metrics,cover])=>({...base[cover],id:'personal-'+code,code,title,desc:teacher+'。'+next+'。',progress,metrics,duration:metrics.split(' · ')[0],type:progress===100?'知识型':'技能型',level:progress===100?'已结课':'学习中'}));})();
