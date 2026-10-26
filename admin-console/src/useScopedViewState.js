import {useEffect,useState} from 'react';
// Only transient filter preferences. Keys include the current account; no learning evidence is stored here.
export function useScopedViewState(key,initial){
 const read=()=>{try{const value=JSON.parse(sessionStorage.getItem('artedu:view:'+key)||'null');return typeof value===typeof initial&&value!==null?value:initial;}catch{return initial;}};
 const [state,setState]=useState(()=>({key,value:read()}));
 const value=state.key===key?state.value:read();
 useEffect(()=>{setState(current=>current.key===key?current:{key,value:read()});},[key]);
 useEffect(()=>{if(state.key!==key)return;try{sessionStorage.setItem('artedu:view:'+key,JSON.stringify(state.value));}catch{}},[key,state]);
 const setValue=next=>setState(current=>({key,value:typeof next==='function'?next(current.key===key?current.value:read()):next}));
 return [value,setValue];
}
