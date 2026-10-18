import { useCallback, useEffect, useRef } from 'react';
import { useFeedback } from './FeedbackCenter.jsx';

export const BEFORE_NAVIGATE='artedu:before-navigate';
// No private draft is copied into storage. Failed saves leave the original form intact.
export function useUnsavedChanges(dirty,{busy=false,label='当前编辑内容'}={}) {
  const {confirmAction,notify}=useFeedback();
  const state=useRef({dirty,busy,label});state.current={dirty,busy,label};
  const confirming=useRef(false);
  const requestLeave=useCallback(async(action)=>{
    if(state.current.busy){notify('正在保存，请等待完成后再离开。','info');return false;}
    if(confirming.current)return false;
    if(state.current.dirty){
      confirming.current=true;
      try {const confirmed=await confirmAction({title:'内容尚未保存',message:`${state.current.label}尚未保存，离开后可能丢失。是否继续离开？`,confirmLabel:'继续离开',cancelLabel:'继续编辑'});if(!confirmed)return false;}
      finally {confirming.current=false;}
    }
    action();return true;
  },[confirmAction,notify]);
  useEffect(()=>{
    if(!dirty&&!busy)return;
    const unload=event=>{event.preventDefault();event.returnValue='';};
    const navigate=event=>{if(event.defaultPrevented)return;event.preventDefault();void requestLeave(event.detail.resume);};
    window.addEventListener('beforeunload',unload);window.addEventListener(BEFORE_NAVIGATE,navigate);
    return()=>{window.removeEventListener('beforeunload',unload);window.removeEventListener(BEFORE_NAVIGATE,navigate);};
  },[dirty,busy,requestLeave]);
  return requestLeave;
}
