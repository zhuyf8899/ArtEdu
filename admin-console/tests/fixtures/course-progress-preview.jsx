// Browser regression fixture only. No API requests, enrollment or real progress writes.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../src/styles.css';
import '../../src/morph/MorphChrome.jsx';
import { MorphCourseCard } from '../../src/morph/MorphCatalog.jsx';
import { mergeCourseRecord } from '../../src/courseProgress.js';

function Preview() {
  const [courses,setCourses]=useState([{id:'qa-color',title:'色彩构成基础',summary:'从色彩原理到实际应用，建立系统的色彩认知与搭配能力，掌握设计中的色彩表达方法。',coverImageUrl:'/morph-v17/assets/48f75777-9e36-4092-a4a1-e571b1e97c3e.svg',category:'设计基础',difficulty:'beginner',author:'验收示例',estimatedMinutes:45,progressPercent:0,catalog:{code:'COL-01'},tools:[]}]);
  const [action,setAction]=useState('');
  return <div className="portal-shell morph-v17"><main className="container" style={{paddingBlock:32,maxWidth:960}}>
    <h1>课程进度组件验收</h1><p>隔离测试数据，不写入账户；复用线上课程卡片与进度同步函数。</p>
    <div className="buttons" style={{display:'flex',gap:12,marginBlock:24}}>{[0,67,100].map(progress=><button className="button secondary" key={progress} onClick={()=>setCourses(current=>mergeCourseRecord(current,{id:'qa-color',progressPercent:progress}))}>模拟保存 {progress}%</button>)}</div>
    <div style={{width:494,maxWidth:'100%'}}><MorphCourseCard course={courses[0]} onOpen={()=>setAction('已打开课程')}/></div><p role="status">{action}</p>
  </main></div>;
}
const root=createRoot(document.getElementById('root'));
root.render(<Preview/>);
if(import.meta.hot)import.meta.hot.dispose(()=>root.unmount());
