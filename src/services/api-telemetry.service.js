import { env } from '../config/env';
import { supabase } from '../infrastructure/supabase/client';

const queue=[];
let flushTimer;
let flushing=false;

function scheduleFlush(){
  if(flushTimer||!queue.length)return;
  flushTimer=globalThis.setTimeout(()=>{flushTimer=undefined;void flushApiTelemetry();},30_000);
}

export function recordApiTelemetry(event){
  if(event.service==='system-health')return;
  queue.push({...event,endpoint:String(event.endpoint||'').replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi,':id').replace(/\/\d+(?=\/|$)/g,'/:id')});
  if(queue.length>100)queue.splice(0,queue.length-100);
  if(queue.length>=20)void flushApiTelemetry();else scheduleFlush();
}

export async function flushApiTelemetry(){
  if(flushing||!queue.length)return;
  flushing=true;
  const events=queue.splice(0,50);
  try{
    const {data}=await supabase.auth.getSession();
    if(!data.session)return;
    const response=await fetch(`${env.supabaseUrl}/functions/v1/system-health/events`,{
      method:'POST',
      headers:{apikey:env.supabaseKey,Authorization:`Bearer ${data.session.access_token}`,'Content-Type':'application/json'},
      body:JSON.stringify({events}),
    });
    if(!response.ok)queue.unshift(...events);
  }catch{queue.unshift(...events);}finally{
    flushing=false;
    if(queue.length)scheduleFlush();
  }
}
