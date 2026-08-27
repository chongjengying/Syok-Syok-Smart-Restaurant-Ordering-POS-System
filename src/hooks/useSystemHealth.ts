import { useCallback, useEffect, useRef, useState } from 'react';
import { SYSTEM_HEALTH_CONFIG } from '../config/system-health';
import { supabase } from '../infrastructure/supabase/client';
import { getSystemHealth, mergeRealtimeHealth } from '../services/systemHealth.service';
import type { RealtimeHealth, SystemHealth } from '../types/systemHealth';

const initialRealtime:RealtimeHealth={status:'UNKNOWN',operationalStatus:'CONNECTING',channelStatus:'CONNECTING',reconnectAttempts:0,message:'Connecting to the operational Realtime channel.'};

export function useSystemHealth(enabled=true){
  const [data,setData]=useState<SystemHealth|null>(null);
  const [realtime,setRealtime]=useState<RealtimeHealth>(initialRealtime);
  const [isLoading,setIsLoading]=useState(enabled);
  const [isRefreshing,setIsRefreshing]=useState(false);
  const [error,setError]=useState('');
  const mounted=useRef(true);
  const hasData=useRef(false);
  const realtimeRef=useRef(initialRealtime);
  const activeRequest=useRef<Promise<void>|null>(null);
  const controller=useRef<AbortController|null>(null);

  const refresh=useCallback(()=>{
    if(!enabled)return Promise.resolve();
    if(activeRequest.current)return activeRequest.current;
    if(hasData.current)setIsRefreshing(true);else setIsLoading(true);
    controller.current=new AbortController();
    const request=(async()=>{
      const result=await getSystemHealth(controller.current?.signal);
      if(!mounted.current)return;
      if(result.error||!result.data){setError(result.error?.message||'Health dashboard is unavailable.');return;}
      setData(mergeRealtimeHealth(result.data,realtimeRef.current));hasData.current=true;setError('');
    })().catch(cause=>{if(mounted.current)setError(cause instanceof Error?cause.message:'Health dashboard is unavailable.');}).finally(()=>{activeRequest.current=null;if(mounted.current){setIsLoading(false);setIsRefreshing(false);}});
    activeRequest.current=request;return request;
  },[enabled]);

  useEffect(()=>{realtimeRef.current=realtime;setData(current=>current?mergeRealtimeHealth(current,realtime):current);},[realtime]);
  useEffect(()=>{
    mounted.current=true;if(!enabled){setIsLoading(false);return undefined;}void refresh();
    const timer=window.setInterval(()=>{if(document.visibilityState==='visible')void refresh();},SYSTEM_HEALTH_CONFIG.refreshMs);
    return()=>{mounted.current=false;window.clearInterval(timer);controller.current?.abort();};
  },[enabled,refresh]);

  useEffect(()=>{
    if(!enabled)return undefined;
    let channel= supabase.channel('system-health-operations');
    channel.on('postgres_changes',{event:'*',schema:'public',table:'orders'},()=>setRealtime(current=>({...current,lastEventAt:new Date().toISOString(),message:'Connected; an order event was received recently.'})));
    channel.subscribe(status=>{
      if(status==='SUBSCRIBED')setRealtime(current=>({...current,status:'HEALTHY',operationalStatus:'CONNECTED',channelStatus:status,message:'Realtime channel is subscribed and connected.'}));
      else if(status==='CHANNEL_ERROR'||status==='TIMED_OUT')setRealtime(current=>({...current,status:'WARNING',operationalStatus:'RECONNECTING',channelStatus:status,reconnectAttempts:current.reconnectAttempts+1,message:'Realtime channel lost connectivity; the client will reconnect.'}));
      else if(status==='CLOSED')setRealtime(current=>({...current,status:'CRITICAL',operationalStatus:'DISCONNECTED',channelStatus:status,message:'Realtime channel is disconnected.'}));
    });
    return()=>{void supabase.removeChannel(channel);};
  },[enabled]);

  return {data,realtime,isLoading,isRefreshing,error,refresh};
}
