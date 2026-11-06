import {createContext,useContext,useEffect,useRef,useState} from 'react';
import {getComfyFeature,setComfyFeature} from './services/adminApi.js';
const Context=createContext({enabled:null,error:'',refresh:()=>{}});
export function ComfyFeatureProvider({children}){
 const [enabled,setEnabled]=useState(null),[error,setError]=useState('');const serial=useRef(0);
 const refresh=async()=>{const n=++serial.current;try{const value=await getComfyFeature();if(n===serial.current){setEnabled(value.enabled);setError('');}}catch(e){if(n===serial.current){setEnabled(null);setError(e.message);}}};
 useEffect(()=>{void refresh();const timer=setInterval(refresh,15000);window.addEventListener('focus',refresh);window.addEventListener('comfy-feature-refresh',refresh);return()=>{serial.current++;clearInterval(timer);window.removeEventListener('focus',refresh);window.removeEventListener('comfy-feature-refresh',refresh);};},[]);
 const update=value=>{serial.current++;setEnabled(value);setError('');};
 return <Context.Provider value={{enabled,error,refresh,update}}>{children}</Context.Provider>;
}
export function useComfyFeature(){return useContext(Context);}
export function ComfyDisabled(){const {enabled,error,refresh}=useComfyFeature();return <section className="portal-empty"><h2>{enabled===false?'节点生图（ComfyUI）已关闭':'正在确认节点生图功能状态…'}</h2>{error&&<><p role="alert">{error}</p><button onClick={refresh}>重新加载</button></>}</section>;}
export function withComfyFeature(Component){return function ComfyFeatureGate(props){return useComfyFeature().enabled===true?<Component {...props}/>:<ComfyDisabled/>;};}
export function ComfyFeatureControl({actor,showToast}){
 const {enabled,error,refresh,update}=useComfyFeature();const [busy,setBusy]=useState(false);const admin=actor?.role==='admin'||actor?.roles?.includes('admin');
 const toggle=async()=>{setBusy(true);try{const next=await setComfyFeature(!enabled);update(next.enabled);showToast(next.enabled?'节点生图已开启':'节点生图已关闭');}catch(e){showToast(e.message);}finally{setBusy(false);}};
 return <section className="workflow-feature-control"><div><h2>节点生图（ComfyUI）</h2><p>统一控制节点工作流的查看、编辑、导入导出、执行、GPU 队列和 Agent 工作流工具。关闭后保留已有工作流数据。</p></div><button type="button" role="switch" aria-label="启用节点生图（ComfyUI）" aria-checked={enabled===true} disabled={!admin||busy||enabled===null} onClick={toggle}>{busy?'正在保存…':enabled===null?'正在加载…':enabled?'已开启 · 点击关闭':'已关闭 · 点击开启'}</button>{!admin&&<small>仅平台管理员可修改</small>}{error&&<p role="alert">{error}<button onClick={refresh}>重新加载</button></p>}</section>;
}
