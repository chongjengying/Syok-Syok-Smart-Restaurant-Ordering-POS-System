export type Status = 'HEALTHY' | 'DEGRADED' | 'WARNING' | 'CRITICAL' | 'UNKNOWN';
export type Check = { component:string; label:string; status:Status; operationalStatus?:string; critical:boolean; latencyMs?:number; message:string; lastCheckedAt:string; lastSuccessfulAt?:string; metadata?:Record<string,unknown> };

export const FUNCTION_PROBES = [
  { name:'orders', label:'Orders', path:'orders?health=probe', critical:true },
  { name:'tables', label:'Tables', path:'tables?health=probe', critical:false },
  { name:'products', label:'Products', path:'products?health=probe', critical:false },
  { name:'payments', label:'Payments', path:'payments?health=probe', critical:true },
  // Read the existing endpoints so their database/RPC dependencies are checked too.
  { name:'admin-users', label:'Staff (admin-users)', path:'admin-users', critical:false },
  { name:'payment-providers', label:'Payment providers', path:'payments/providers', critical:true },
];

export async function probeFunction(
  baseUrl:string, anonKey:string, authorization:string, target:typeof FUNCTION_PROBES[number],
  { fetchImpl=fetch, timeoutMs=5_000, healthyMs=500, warningMs=1_500 } = {},
):Promise<Check> {
  const checkedAt=new Date().toISOString();
  const started=performance.now();
  const base={component:`edge-${target.name}`,label:target.label,critical:target.critical,lastCheckedAt:checkedAt};
  let response:Response|undefined;
  try {
    response=await fetchImpl(`${baseUrl}/functions/v1/${target.path}`, {
      headers:{apikey:anonKey,Authorization:authorization},signal:AbortSignal.timeout(timeoutMs),
    });
    if(!response.ok) {
      // A permission denial is not an outage and must never become a false pass.
      const status:Status=response.status===403?'UNKNOWN':[401,429].includes(response.status)?'WARNING':'CRITICAL';
      return {...base,status,latencyMs:Math.round(performance.now()-started),message:response.status===403?'Not verified: this account cannot access this endpoint.':`Function returned HTTP ${response.status}.`};
    }
    const payload=await response.json();
    if(!payload || typeof payload!=='object' || !payload.data || payload.error) {
      return {...base,status:'CRITICAL',latencyMs:Math.round(performance.now()-started),message:'Function returned an invalid health response.'};
    }
    const latencyMs=Math.round(performance.now()-started);
    return {...base,status:latencyMs<healthyMs?'HEALTHY':latencyMs<=warningMs?'WARNING':'DEGRADED',latencyMs,message:`Authenticated endpoint responded in ${latencyMs} ms.`,lastSuccessfulAt:checkedAt};
  } catch(cause) {
    const timedOut=cause instanceof Error && ['TimeoutError','AbortError'].includes(cause.name);
    return {...base,status:'CRITICAL',latencyMs:Math.round(performance.now()-started),message:timedOut?'Function probe timed out.':'Function probe failed or returned invalid JSON.'};
  } finally {
    if(response?.body && !response.bodyUsed) await response.body.cancel().catch(()=>{});
  }
}

export function summarizeFunctionProbes(checks:Check[]):Status {
  if(checks.some(check=>check.critical && check.status==='CRITICAL')) return 'CRITICAL';
  if(checks.some(check=>['CRITICAL','WARNING'].includes(check.status))) return 'WARNING';
  if(checks.some(check=>check.status==='DEGRADED')) return 'DEGRADED';
  if(!checks.length || checks.some(check=>check.status==='UNKNOWN')) return 'UNKNOWN';
  return 'HEALTHY';
}
