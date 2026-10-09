import {useEffect,useState} from 'react';
import {readGraphSession,writeGraphSession} from './graphSession.js';
export function useGraphSessionState(key,field,fallback) {
 const [value,setValue]=useState(()=>readGraphSession(key)?.[field]??fallback);
 useEffect(()=>{writeGraphSession(key,{...readGraphSession(key),[field]:value});},[key,field,value]);
 return [value,setValue];
}
