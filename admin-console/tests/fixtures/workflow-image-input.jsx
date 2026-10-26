import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { WorkflowImageInput } from '../../src/WorkflowImageInput.jsx';
function Fixture() { const [value,setValue]=useState(null); window.maskFixture=value; return <main style={{maxWidth:640,margin:'20px auto',background:'#202938',color:'white',padding:20}}><h1>图片编辑与局部重绘</h1><WorkflowImageInput value={value} onChange={setValue}/><button disabled={!value?.imageFile||value.maskPending}>提交图片与遮罩</button></main>; }
createRoot(document.getElementById('root')).render(<Fixture/>);
