import '../../src/styles.css';
import '../../src/morph/platform-unified.css';
import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {ComfyCanvas} from '../../src/ComfyCanvas.jsx';
import {importComfy} from '../../src/comfyGraph.js';
const initial=importComfy({'1':{class_type:'Source',inputs:{text:'离线交换'}},'2':{class_type:'SaveImage',inputs:{images:['1',0]}}});
function Fixture(){const [editor,setEditor]=useState({name:'离线 ComfyUI 交换',definition:initial});window.exchangeFixture=editor.definition;return <ComfyCanvas canPublish editor={editor} selected={{id:'offline-qa'}} onDefinition={definition=>setEditor(e=>({...e,definition}))} onChange={(key,value)=>setEditor(e=>({...e,[key]:value}))} onBack={()=>{}} onSave={async()=>({id:'saved'})} onNotice={()=>{}}/>;}
createRoot(document.getElementById('root')).render(<Fixture/>);
