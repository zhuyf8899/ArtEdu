import {useEffect,useRef,useState} from 'react';
import {ReactFlow,Background,Controls} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {WorkflowImageInput} from './WorkflowImageInput.jsx';
import {removeTemporaryWorkflow,getTemporaryWorkflow,startTemporaryWorkflow,saveTemporaryWorkflowDraft} from './services/adminApi.js';
import {getLocalWorkflow,saveLocalWorkflow,getLocalWorkflowFile,saveLocalWorkflowFile,ensureRemoteWorkflow,uploadLocalBindings,archiveTemporaryResults} from './temporaryWorkflowStore.js';
import {randomId} from './randomId.js';
import './temporary-workflow.css';

function LocalResult({userId,id,artifact,updatedAt}){const [url,setUrl]=useState('');useEffect(()=>{let active=true,objectUrl;void getLocalWorkflowFile(userId,id,artifact.id).then(file=>{if(active&&file?.blob){objectUrl=URL.createObjectURL(file.blob);setUrl(objectUrl);}});return()=>{active=false;if(objectUrl)URL.revokeObjectURL(objectUrl);};},[userId,id,artifact.id,updatedAt]);return <div>{url?<>{artifact.mimeType.startsWith('image/')&&<img src={url} alt={artifact.fileName}/>}<a href={url} download={artifact.fileName}>从本机下载 {artifact.fileName}</a></>:<p role="alert">成果尚未保存到本机，请在云端清理前点击“重试同步成果”。</p>}</div>;}
function LocalInput({userId,id,node,onState}){
 const [value,setValue]=useState(null),[error,setError]=useState('');const previous=useRef(null),writes=useRef(Promise.resolve()),changeNumber=useRef(0);
 useEffect(()=>{let active=true;void Promise.all([getLocalWorkflowFile(userId,id,`input-${node.id}-image`),getLocalWorkflowFile(userId,id,`input-${node.id}-mask`)]).then(([image,mask])=>{if(active&&image?.blob){const v={imageFile:new File([image.blob],'image.png',{type:'image/png'}),maskFile:mask?.blob?new File([mask.blob],'mask.png',{type:'image/png'}):null,maskPending:false};previous.current=v;setValue(v);onState(node.id,v);}});return()=>{active=false;};},[userId,id,node.id]);
 const change=next=>{const version=++changeNumber.current;setValue(next);onState(node.id,{...next,localSaving:true});setError('');writes.current=writes.current.catch(()=>{}).then(async()=>{try{if(next?.imageFile!==previous.current?.imageFile)await saveLocalWorkflowFile(userId,id,`input-${node.id}-image`,next?.imageFile||null);if(next?.maskFile!==previous.current?.maskFile)await saveLocalWorkflowFile(userId,id,`input-${node.id}-mask`,next?.maskFile||null);previous.current=next;if(version===changeNumber.current)onState(node.id,next);}catch(e){if(version===changeNumber.current){setError(e.message||'本机图片保存失败');onState(node.id,{...next,localSaving:true});}}});};
 return <details><summary>{node.data.label} · 本机图片与遮罩</summary><WorkflowImageInput value={value} onChange={change}/>{error&&<p role="alert">{error}</p>}</details>;
}

/** Mounting, opening and viewing results never restore or renew any cloud cache. */
export function TemporaryWorkflowCard({userId,conversationId,id,onSelect}){
 const [record,setRecord]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[inputs,setInputs]=useState({}),[expanded,setExpanded]=useState(false);
 const active=useRef(true),timer=useRef(null),action=useRef(false),polling=useRef(false);
 useEffect(()=>{active.current=true;const load=()=>void getLocalWorkflow(userId,id).then(r=>{if(active.current)setRecord(r);}).catch(e=>{if(active.current)setError(e.message);});load();const update=e=>{if(e.detail.user===userId&&e.detail.id===id)load();};window.addEventListener('artedu:temporary-workflow-updated',update);return()=>{active.current=false;clearTimeout(timer.current);window.removeEventListener('artedu:temporary-workflow-updated',update);};},[userId,id]);
 const store=async snapshot=>{const r=await saveLocalWorkflow(userId,conversationId,snapshot);if(active.current)setRecord(r);return r;};
 const snapshot=record?.snapshot;
 const poll=async()=>{if(polling.current)return;polling.current=true;clearTimeout(timer.current);try{const next=await getTemporaryWorkflow(id);await store(next);await archiveTemporaryResults(userId,next);await store(next);if(next.execution?.status==='running'&&active.current)timer.current=setTimeout(poll,1500);else if(active.current)setBusy(false);}catch(e){if(active.current){setBusy(false);setError(e.message);}}finally{polling.current=false;}};
 useEffect(()=>{if(snapshot?.execution?.status==='running'&&!action.current){setBusy(true);clearTimeout(timer.current);timer.current=setTimeout(poll,1500);}return()=>clearTimeout(timer.current);},[snapshot?.execution?.id,snapshot?.execution?.status]);
 const execute=async()=>{if(action.current||!snapshot)return;action.current=true;setBusy(true);setError('');try{await saveLocalWorkflow(userId,conversationId,snapshot);const remote=await uploadLocalBindings(userId,await ensureRemoteWorkflow(userId,id));await store(remote);const started=await startTemporaryWorkflow(id,{revision:remote.revision,requestId:randomId()});await store(started);if(active.current)void poll();}catch(e){setBusy(false);setError(e.message);}finally{action.current=false;}};
 const saveFormal=async()=>{if(action.current||!snapshot)return;action.current=true;setBusy(true);setError('');try{const remote=await ensureRemoteWorkflow(userId,id);await store(await saveTemporaryWorkflowDraft(id,remote.revision));}catch(e){setError(e.message);}finally{action.current=false;setBusy(false);}};
 const clearCloud=async()=>{if(action.current)return;action.current=true;setBusy(true);setError('');try{await removeTemporaryWorkflow(id);}catch(e){if(![404,410].includes(e.status))setError(e.message);}finally{action.current=false;setBusy(false);}};
 const select=async()=>{if(!snapshot)return;try{await saveLocalWorkflow(userId,conversationId,snapshot);onSelect?.(id,snapshot.name);}catch(e){setError(e.message);}};
 const download=()=>{if(!snapshot)return;const url=URL.createObjectURL(new Blob([JSON.stringify({format:'artedu-temporary-workflow',version:1,...snapshot},null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`${snapshot.name}.json`;a.click();URL.revokeObjectURL(url);};
 if(!snapshot)return <section className="temporary-workflow-card"><p>{error||'正在读取本机工作流…'}</p></section>;
 const execution=snapshot.execution||record.history.at(-1),incomplete=snapshot.definition.nodes.some(n=>n.type==='load_image'&&(!inputs[n.id]?.imageFile||inputs[n.id]?.maskPending||inputs[n.id]?.localSaving));
 return <section className="temporary-workflow-card" aria-label="临时工作流">
  <header><strong>{snapshot.name} · v{snapshot.revision}</strong><span>本人草稿 · 已存本机</span></header><p>{snapshot.changeSummary}</p>
  <button type="button" onClick={()=>setExpanded(!expanded)} aria-expanded={expanded}>{expanded?'收起节点图':'查看节点图与参数'}</button>
  {expanded&&<><div className="temporary-workflow-preview"><ReactFlow nodes={snapshot.definition.nodes.map(n=>({id:n.id,position:n.position,data:{label:n.data.label},type:'default'}))} edges={snapshot.definition.edges} fitView nodesDraggable={false} nodesConnectable={false}><Background/><Controls showInteractive={false}/></ReactFlow></div><ol>{snapshot.definition.nodes.map(n=><li key={n.id}><strong>{n.data.label}</strong> · {n.type}{n.data.value&&<pre>{n.data.value}</pre>}</li>)}</ol></>}
  {snapshot.definition.nodes.filter(n=>n.type==='load_image').map(node=><LocalInput key={node.id} userId={userId} id={id} node={node} onState={(nodeId,value)=>setInputs(v=>({...v,[nodeId]:value}))}/>)}
  <p>执行会消耗 API 额度。云端空闲 20 分钟后清理，之后可从本机恢复。</p>
  <div className="temporary-workflow-actions"><button type="button" disabled={busy||incomplete} onClick={execute}>{busy?'处理中…':'确认执行此版本'}</button><button type="button" disabled={busy} onClick={select}>让 Agent 继续修改</button><button type="button" disabled={busy} onClick={saveFormal}>保存正式草稿（云端）</button><button type="button" onClick={download}>下载本机节点图</button><button type="button" disabled={busy} onClick={clearCloud}>清理云端临时副本</button></div>
  {error&&<p role="alert">{error}</p>}
  {execution&&<section><strong>v{execution.revision} · {({running:'正在执行',completed:'执行完成',failed:'执行失败'})[execution.status]}</strong><p>{execution.completedNodes.length} / {snapshot.definition.nodes.length} 个节点</p>{execution.error&&<p role="alert">{execution.error}</p>}{execution.text&&<pre>{execution.text}</pre>}{execution.artifacts.map(a=><LocalResult key={a.id} userId={userId} id={id} artifact={a} updatedAt={record.updatedAt}/>)}{execution.artifacts.length>0&&<button type="button" onClick={()=>{setBusy(true);void poll();}}>重试同步成果</button>}</section>}
 </section>;
}
