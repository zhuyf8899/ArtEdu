import React,{useState} from 'react';
import{createRoot}from'react-dom/client';
import{DocumentPreviewDialog}from'../../src/DocumentPreview.jsx';
function Fixture(){
 const[file,setFile]=useState(null),[open,setOpen]=useState(false);
 const sample=async format=>{const url=format==='docx'?new URL('./preview-sample.docx',import.meta.url):new URL('./preview-sample.pptx',import.meta.url);const response=await fetch(url);setFile(new File([await response.blob()],`ArtEdu-预览样例.${format}`));setOpen(true);};
 return <main style={{fontFamily:'Arial',padding:32}}><h1>ArtEdu 文档预览验证</h1><p>样例仅在浏览器解析，不上传。</p><button onClick={()=>sample('docx')}>查看 Word 样例</button><button onClick={()=>sample('pptx')}>查看 PPT 样例</button><label>选择样例文件<input aria-label="选择样例文件" type="file" accept=".docx,.pptx,.pdf" onChange={e=>{setFile(e.target.files[0]);setOpen(true);}}/></label>{file&&<button onClick={()=>setOpen(true)}>打开预览</button>}{open&&file&&<DocumentPreviewDialog fileName={file.name} blob={file} onClose={()=>setOpen(false)}/>}</main>;
};createRoot(document.getElementById('root')).render(<Fixture/>);
