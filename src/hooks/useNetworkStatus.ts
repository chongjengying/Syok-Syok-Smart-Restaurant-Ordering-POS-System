import {useEffect,useState} from 'react';

export type NetworkState='ONLINE'|'OFFLINE'|'RECONNECTING';

export function useNetworkStatus(){
 const[state,setState]=useState<NetworkState>(()=>navigator.onLine?'ONLINE':'OFFLINE');
 useEffect(()=>{
  let timer:number|undefined;
  const offline=()=>{window.clearTimeout(timer);setState('OFFLINE');};
  const online=()=>{setState('RECONNECTING');window.clearTimeout(timer);timer=window.setTimeout(()=>setState('ONLINE'),1500);};
  window.addEventListener('offline',offline);window.addEventListener('online',online);
  return()=>{window.clearTimeout(timer);window.removeEventListener('offline',offline);window.removeEventListener('online',online);};
 },[]);
 return state;
}
