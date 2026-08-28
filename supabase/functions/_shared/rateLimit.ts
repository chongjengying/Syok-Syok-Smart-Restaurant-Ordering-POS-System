import {createClient} from 'npm:@supabase/supabase-js@2';

export async function consumeRateLimit(subject:string,action:string,limit:number,windowSeconds:number){
 const url=Deno.env.get('SUPABASE_URL');const serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
 if(!url||!serviceKey)return {allowed:false,error:'RATE_LIMIT_CONFIGURATION_MISSING'};
 const admin=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
 const{data,error}=await admin.rpc('consume_api_rate_limit',{p_subject_key:subject,p_action:action,p_limit:limit,p_window_seconds:windowSeconds});
 if(error)return {allowed:false,error:'RATE_LIMIT_UNAVAILABLE'};
 return {allowed:data===true,error:data===true?null:'RATE_LIMIT_EXCEEDED'};
}
