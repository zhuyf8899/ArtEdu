import React from 'react';import {createRoot} from 'react-dom/client';
import {AiCreationWorkspace} from '../../src/CreationWorkspace.jsx';
import {FeedbackProvider} from '../../src/FeedbackCenter.jsx';
import '../../src/styles.css';
const data=await fetch('/__agent-regression.json').then(r=>r.json());
const entry=data.cases.find(c=>c.id===Number(new URLSearchParams(location.search).get('case')));
const onCreate=async(request,signal,onDelta,onProgress)=>{
 window.__request=request;
 for(const event of entry.events){if(signal.aborted)throw new DOMException('用户暂停','AbortError');onProgress(event);await new Promise(resolve=>setTimeout(resolve,10));}
 return {id:'ui-regression-'+entry.id,status:entry.status,delivery:entry.delivery,content:entry.content};
};
createRoot(document.getElementById('root')).render(<FeedbackProvider><AiCreationWorkspace account={{id:'isolated-ui-'+entry.id,displayName:'隔离回归'}} creation={{enabled:true,models:[{id:'fixture-chat',name:'隔离测试模型',capabilities:['chat','webpage','document']}],quota:{}}} onCreate={onCreate}/></FeedbackProvider>);
