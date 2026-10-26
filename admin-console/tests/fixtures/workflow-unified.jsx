import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../src/styles.css';
import '../../src/morph/platform-unified.css';
import { WorkflowCanvas } from '../../src/WorkflowAdmin.jsx';
const n=(id,type,value,x,y)=>({id,type,position:{x,y},data:{label:id,description:'统一画布：参数、分支和循环',value}});
const initial={schemaVersion:2,nodes:[n('主题文字','text_constant','传统纹样海报',0,0),{...n('循环润色','loop','{text} · 第 {index} 轮',400,0),data:{label:'循环润色',value:'{text} · 第 {index} 轮',operation:'text_template',iterations:2}},n('结果预览','text_preview','',800,0)],edges:[{id:'e1',source:'主题文字',target:'循环润色',sourceHandle:'output',targetHandle:'input'},{id:'e2',source:'循环润色',target:'结果预览',sourceHandle:'output',targetHandle:'input'}],groups:[{id:'g',title:'文字处理',color:'#9ed85b',nodeIds:['主题文字','循环润色']}],viewport:{x:0,y:0,zoom:1}};
function Fixture(){
 const [editor,setEditor]=useState({name:'统一节点画布',description:'验收',category:'测试',entryType:'workbench',definition:initial});
 window.unifiedGraph=editor.definition;window.setUnifiedGraph=definition=>setEditor(e=>({...e,definition}));
 window.notices ||= [];
 return <WorkflowCanvas editor={editor} selected={{id:'qa-unified',versions:[{id:'v1'}]}} canPublish onDefinition={definition=>setEditor(e=>({...e,definition}))} onChange={(key,value)=>setEditor(e=>({...e,[key]:value}))} onBack={()=>{}} onSave={async()=>({id:'v1'})} onNotice={message=>window.notices.push(message)}/>;
}
createRoot(document.getElementById('root')).render(<Fixture/>);
