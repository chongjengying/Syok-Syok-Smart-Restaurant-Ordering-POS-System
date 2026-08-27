import { createClient } from 'npm:@supabase/supabase-js@2';
import { buildCorsHeaders, jsonResponse as createJsonResponse } from '../_shared/http.ts';

type Status = 'HEALTHY' | 'DEGRADED' | 'WARNING' | 'CRITICAL' | 'UNKNOWN';
type Check = { component:string; label:string; status:Status; operationalStatus?:string; critical:boolean; latencyMs?:number; message:string; lastCheckedAt:string; lastSuccessfulAt?:string; metadata?:Record<string,unknown> };

const corsHeaders = buildCorsHeaders('GET, POST, OPTIONS');
const jsonResponse = (status:number, body:Record<string,unknown>) => createJsonResponse(status, body, corsHeaders);
const HEALTHY_MS = Number(Deno.env.get('HEALTH_LATENCY_HEALTHY_MS') || 500);
const WARNING_MS = Number(Deno.env.get('HEALTH_LATENCY_WARNING_MS') || 1500);
const BACKUP_WARNING_HOURS = Number(Deno.env.get('BACKUP_WARNING_HOURS') || 24);
const BACKUP_CRITICAL_HOURS = Number(Deno.env.get('BACKUP_CRITICAL_HOURS') || 48);
const KDS_ONLINE_SECONDS = Number(Deno.env.get('KDS_ONLINE_SECONDS') || 30);
const KDS_WARNING_SECONDS = Number(Deno.env.get('KDS_WARNING_SECONDS') || 60);
const CACHE_MS = 15_000;
let cached: { at:number; data:Record<string,unknown> } | null = null;
const rateBuckets=new Map<string,{windowStarted:number;gets:number;posts:number}>();

const latencyStatus = (ms:number):Status => ms < HEALTHY_MS ? 'HEALTHY' : ms <= WARNING_MS ? 'WARNING' : 'DEGRADED';
const cleanText = (value:unknown, max:number) => String(value || '').replace(/[\r\n\t]/g, ' ').replace(/Bearer\s+\S+/gi, '[REDACTED]').slice(0,max);
const environment = () => {
  const value = String(Deno.env.get('APP_ENV') || 'development').toUpperCase();
  return ['LOCAL','DEVELOPMENT','STAGING','PRODUCTION'].includes(value) ? value : 'DEVELOPMENT';
};

function overall(checks:Check[]):Status {
  if (checks.some(c => c.critical && c.status === 'CRITICAL')) return 'CRITICAL';
  if (checks.some(c => c.status === 'CRITICAL' || c.status === 'WARNING')) return 'WARNING';
  if (checks.some(c => c.status === 'DEGRADED')) return 'DEGRADED';
  if (checks.some(c => c.status === 'HEALTHY')) return 'HEALTHY';
  return 'UNKNOWN';
}

async function timed<T>(operation:()=>Promise<T>, timeoutMs=5_000) {
  const started = performance.now();
  let timer:number | undefined;
  try {
    const result = await Promise.race([
      operation(),
      new Promise<never>((_,reject) => { timer=setTimeout(()=>reject(new Error('TIMEOUT')),timeoutMs); }),
    ]);
    return { result, latencyMs:Math.round(performance.now()-started), error:null as Error|null };
  } catch (cause) {
    return { result:null, latencyMs:Math.round(performance.now()-started), error:cause instanceof Error?cause:new Error('UNKNOWN') };
  } finally { clearTimeout(timer); }
}

async function probeFunction(baseUrl:string, anonKey:string, authorization:string, name:string):Promise<Check> {
  const checkedAt=new Date().toISOString();
  const probe=await timed(()=>fetch(`${baseUrl}/functions/v1/${name}?health=probe`, {headers:{apikey:anonKey,Authorization:authorization}}));
  if (probe.error) return {component:`edge-${name}`,label:name,status:'CRITICAL',critical:['orders','payments'].includes(name),latencyMs:probe.latencyMs,message:`Function probe ${probe.error.message==='TIMEOUT'?'timed out':'failed'}.`,lastCheckedAt:checkedAt};
  const response=probe.result as Response;
  const ok=response.ok;
  return {component:`edge-${name}`,label:name,status:ok?latencyStatus(probe.latencyMs):response.status>=500?'CRITICAL':'WARNING',critical:['orders','payments'].includes(name),latencyMs:probe.latencyMs,message:ok?`Function responded in ${probe.latencyMs} ms.`:`Function returned HTTP ${response.status}.`,lastCheckedAt:checkedAt,...(ok?{lastSuccessfulAt:checkedAt}:{})};
}

Deno.serve(async request => {
  const correlationId=request.headers.get('x-correlation-id')?.slice(0,80) || `health_${crypto.randomUUID()}`;
  if(request.method==='OPTIONS') return new Response('ok',{headers:corsHeaders});
  if(!['GET','POST'].includes(request.method)) return jsonResponse(405,{error:'Method not allowed.',code:'METHOD_NOT_ALLOWED',correlationId});
  const authorization=request.headers.get('Authorization');
  const url=Deno.env.get('SUPABASE_URL');
  const anonKey=Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if(!authorization?.startsWith('Bearer ')) return jsonResponse(401,{error:'Authentication is required.',code:'AUTHENTICATION_REQUIRED',correlationId});
  if(!url||!anonKey||!serviceKey) return jsonResponse(503,{error:'Health service configuration is incomplete.',code:'SERVICE_CONFIGURATION_ERROR',correlationId});

  const caller=createClient(url,anonKey,{global:{headers:{Authorization:authorization}},auth:{persistSession:false}});
  const authResult=await caller.auth.getUser();
  if(authResult.error||!authResult.data.user) return jsonResponse(401,{error:'The session is invalid or expired.',code:'SESSION_EXPIRED',correlationId});
  const rateKey=authResult.data.user.id;
  const now=Date.now();
  const prior=rateBuckets.get(rateKey);
  const bucket=!prior||now-prior.windowStarted>=60_000?{windowStarted:now,gets:0,posts:0}:prior;
  if(request.method==='POST')bucket.posts+=1;else bucket.gets+=1;
  rateBuckets.set(rateKey,bucket);
  if(bucket.posts>10||bucket.gets>30)return jsonResponse(429,{error:'Health endpoint rate limit exceeded.',code:'RATE_LIMITED',correlationId});
  const {data:profile}=await caller.from('profiles').select('status').eq('id',authResult.data.user.id).single();
  if(!profile||profile.status!=='ACTIVE') return jsonResponse(403,{error:'An active staff profile is required.',code:'INSUFFICIENT_PERMISSION',correlationId});

  if(request.method==='POST') {
    let body:unknown;
    try { body=await request.json(); } catch { return jsonResponse(400,{error:'Request body must be valid JSON.',code:'INVALID_REQUEST',correlationId}); }
    const raw=body&&typeof body==='object'&&!Array.isArray(body)?(body as Record<string,unknown>).events:null;
    if(!Array.isArray(raw)||raw.length<1||raw.length>50) return jsonResponse(400,{error:'events must contain between 1 and 50 records.',code:'INVALID_EVENTS',correlationId});
    const allowedErrors=new Set(['VALIDATION_ERROR','AUTH_ERROR','PERMISSION_ERROR','NETWORK_ERROR','DATABASE_ERROR','TIMEOUT','DEPENDENCY_ERROR','PAYMENT_PROVIDER_ERROR','DEVICE_ERROR','INTERNAL_ERROR']);
    const rows=raw.map(item=>{
      const event=item&&typeof item==='object'&&!Array.isArray(item)?item as Record<string,unknown>:{};
      const status=Math.min(599,Math.max(0,Number(event.statusCode)||0));
      const errorType=allowedErrors.has(String(event.errorType))?String(event.errorType):null;
      return {service:cleanText(event.service,60)||'frontend',endpoint:cleanText(event.endpoint,180)||'unknown',method:cleanText(event.method,10).toUpperCase()||'GET',status_code:status,error_type:errorType,duration_ms:Math.min(300000,Math.max(0,Number(event.durationMs)||0)),correlation_id:cleanText(event.correlationId,80)||correlationId,infrastructure_failure:Boolean(event.infrastructureFailure)};
    });
    const service=createClient(url,serviceKey,{auth:{persistSession:false}});
    const inserted=await service.from('system_api_events').insert(rows);
    if(inserted.error) { console.error(JSON.stringify({timestamp:new Date().toISOString(),level:'ERROR',service:'system-health',operation:'ingestTelemetry',correlationId,errorCode:'DATABASE_ERROR'})); return jsonResponse(503,{error:'Telemetry could not be recorded.',code:'DATABASE_ERROR',correlationId}); }
    return jsonResponse(202,{data:{accepted:rows.length},correlationId});
  }

  const {data:allowed}=await caller.rpc('has_pos_permission',{p_permission:'system.health.view'});
  if(!allowed) return jsonResponse(403,{error:'System health permission is required.',code:'INSUFFICIENT_PERMISSION',correlationId});
  if(cached&&Date.now()-cached.at<CACHE_MS) return jsonResponse(200,{data:{...cached.data,correlationId,cached:true}});

  const checkedAt=new Date().toISOString();
  const [coreChecks,edgeChecks]=await Promise.all([
    Promise.all([
      timed(()=>fetch(`${url}/auth/v1/health`,{headers:{apikey:anonKey}})),
      timed(()=>caller.rpc('system_health_db_probe')),
      timed(()=>caller.rpc('get_system_health_metrics')),
    ]),
    Promise.all(['orders','tables','products','payments'].map(name=>probeFunction(url,anonKey,authorization,name))),
  ]);
  const [supabaseProbe,dbProbe,metricsResult]=coreChecks;
  const supabaseResponse=supabaseProbe.result as Response|null;
  const supabaseOk=!supabaseProbe.error&&Boolean(supabaseResponse?.ok);
  const supabaseCheck:Check={component:'supabase',label:'Supabase',status:supabaseOk?latencyStatus(supabaseProbe.latencyMs):'CRITICAL',critical:true,latencyMs:supabaseProbe.latencyMs,message:supabaseOk?`Supabase API responded in ${supabaseProbe.latencyMs} ms.`:supabaseProbe.error?.message==='TIMEOUT'?'Supabase API timed out.':'Supabase API is unavailable.',lastCheckedAt:checkedAt,...(supabaseOk?{lastSuccessfulAt:checkedAt}:{})};
  const dbPayload=dbProbe.result as {error?:unknown}|null;
  const dbOk=!dbProbe.error&&!dbPayload?.error;
  const databaseCheck:Check={component:'database',label:'Database',status:dbOk?latencyStatus(dbProbe.latencyMs):'CRITICAL',critical:true,latencyMs:dbProbe.latencyMs,message:dbOk?`PostgreSQL health RPC responded in ${dbProbe.latencyMs} ms.`:dbProbe.error?.message==='TIMEOUT'?'Database health check timed out.':'Database health query failed.',lastCheckedAt:checkedAt,...(dbOk?{lastSuccessfulAt:checkedAt}:{})};
  const metricsPayload=metricsResult.result as {data?:Record<string,unknown>;error?:unknown}|null;
  const metrics=metricsPayload?.data||{};
  const metricsOk=!metricsResult.error&&!metricsPayload?.error;
  const observabilityCheck:Check={component:'observability',label:'Operational Metrics',status:metricsOk?'HEALTHY':'WARNING',critical:false,latencyMs:metricsResult.latencyMs,message:metricsOk?`Sanitized operational metrics loaded in ${metricsResult.latencyMs} ms.`:'Operational history could not be loaded; dependency checks remain available.',lastCheckedAt:checkedAt,...(metricsOk?{lastSuccessfulAt:checkedAt}:{})};
  const api=(metrics.api||{}) as Record<string,unknown>;
  const total=Number(api.totalRequests||0), failed=Number(api.failedRequests||0), failureRate=total?failed/total:0;
  const apiCheck:Check={component:'api',label:'API Requests',status:total===0?'UNKNOWN':failureRate>=0.05?'CRITICAL':failureRate>=0.01?'WARNING':'HEALTHY',critical:false,message:total===0?'No telemetry has been received in the last 24 hours.':`${failed} infrastructure failures across ${total} observed requests.`,lastCheckedAt:checkedAt,metadata:{failureRate}};
  const payment=(metrics.payment||{}) as Record<string,unknown>;
  const paymentCheck:Check={component:'payment',label:'Payment Gateway',status:'UNKNOWN',operationalStatus:'NOT_CONFIGURED',critical:false,message:'No external payment gateway is configured; cash and manual QR remain available.',lastCheckedAt:checkedAt,metadata:{provider:'UNCONFIGURED',mode:'MANUAL',lastSuccessfulTransaction:String(payment.lastSuccessfulTransaction||''),lastFailedTransaction:String(payment.lastFailedTransaction||'')}};
  const devices=Array.isArray(metrics.devices)?metrics.devices as Record<string,unknown>[]:[];
  const deviceChecks:Check[]=['RECEIPT_PRINTER','KITCHEN_PRINTER'].map(type=>{const device=devices.find(d=>d.device_type===type);if(!device)return {component:type.toLowerCase(),label:type==='RECEIPT_PRINTER'?'Receipt Printer':'Kitchen Printer',status:'UNKNOWN',operationalStatus:'NOT_CONFIGURED',critical:false,message:'No authoritative device heartbeat is configured.',lastCheckedAt:checkedAt};const age=(Date.now()-new Date(String(device.last_seen_at)).getTime())/1000;const status:Status=age<=KDS_ONLINE_SECONDS?'HEALTHY':age<=KDS_WARNING_SECONDS?'WARNING':'CRITICAL';return {component:type.toLowerCase(),label:String(device.display_name),status,operationalStatus:status==='HEALTHY'?'CONNECTED':status==='WARNING'?'DISCONNECTED':'OFFLINE',critical:false,message:`Last device heartbeat was ${Math.round(age)} seconds ago.`,lastCheckedAt:checkedAt,lastSuccessfulAt:String(device.last_success_at||device.last_seen_at),metadata:{pendingJobs:Number(device.pending_jobs||0),failedJobs:Number(device.failed_jobs||0)}};});
  const kdsDevices=devices.filter(d=>d.device_type==='KDS');
  const kdsWorst=kdsDevices.reduce((worst,d)=>Math.max(worst,(Date.now()-new Date(String(d.last_seen_at)).getTime())/1000),0);
  const kdsStatus:Status=!kdsDevices.length?'UNKNOWN':kdsWorst<KDS_ONLINE_SECONDS?'HEALTHY':kdsWorst<=KDS_WARNING_SECONDS?'WARNING':'CRITICAL';
  const kdsCheck:Check={component:'kds',label:'Kitchen Display System',status:kdsStatus,operationalStatus:!kdsDevices.length?'NOT_CONFIGURED':kdsStatus==='HEALTHY'?'ONLINE':kdsStatus==='WARNING'?'DISCONNECTED':'OFFLINE',critical:false,message:!kdsDevices.length?'No KDS heartbeat source is configured.':`${kdsDevices.length} KDS station(s) reporting; stalest heartbeat ${Math.round(kdsWorst)} seconds ago.`,lastCheckedAt:checkedAt};
  const backup=metrics.backup as Record<string,unknown>|null;
  const backupAge=backup?.completed_at?(Date.now()-new Date(String(backup.completed_at)).getTime())/3_600_000:NaN;
  const backupStatus:Status=!Number.isFinite(backupAge)?'UNKNOWN':backup?.status!=='SUCCEEDED'||backupAge>BACKUP_CRITICAL_HOURS?'CRITICAL':backupAge>=BACKUP_WARNING_HOURS?'WARNING':'HEALTHY';
  const backupCheck:Check={component:'backup',label:'Database Backup',status:backupStatus,critical:false,message:!backup?'No authoritative backup record is available.':`Latest verified ${String(backup.status).toLowerCase()} backup is ${backupAge.toFixed(1)} hours old.`,lastCheckedAt:checkedAt,...(backup?.completed_at?{lastSuccessfulAt:String(backup.completed_at)}:{}),metadata:backup?{provider:String(backup.provider),nextScheduledAt:String(backup.next_scheduled_at||'')}:undefined};
  const realtimeCheck:Check={component:'realtime',label:'Realtime',status:'UNKNOWN',critical:false,message:'Realtime connectivity is measured by the active browser session.',lastCheckedAt:checkedAt};
  const components=[supabaseCheck,databaseCheck,realtimeCheck,{component:'edge-functions',label:'Edge Functions',status:overall(edgeChecks),critical:true,message:'Independent probes for orders, tables, products and payments.',lastCheckedAt:checkedAt,metadata:{checks:edgeChecks}},observabilityCheck,apiCheck,paymentCheck,...deviceChecks,kdsCheck,backupCheck];
  const data={overallStatus:overall(components),environment:environment(),version:{appVersion:Deno.env.get('APP_VERSION')||'unknown',commitSha:Deno.env.get('GIT_COMMIT_SHA')||'',buildId:Deno.env.get('BUILD_ID')||'',buildTimestamp:Deno.env.get('BUILD_TIMESTAMP')||''},components,api:{totalRequests:total,failedRequests:failed,failureRate,clientErrors:Number(api.clientErrors||0),serverErrors:Number(api.serverErrors||0),timeouts:Number(api.timeouts||0),recentErrors:Array.isArray(api.recentErrors)?api.recentErrors:[]},incidents:Array.isArray(metrics.incidents)?metrics.incidents:[],checkedAt};
  cached={at:Date.now(),data};
  console.info(JSON.stringify({timestamp:checkedAt,level:'INFO',service:'system-health',operation:'check',correlationId,status:data.overallStatus}));
  return jsonResponse(200,{data:{...data,correlationId,cached:false}});
});
