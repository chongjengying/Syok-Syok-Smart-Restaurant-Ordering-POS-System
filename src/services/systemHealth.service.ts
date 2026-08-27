import { BUILD_INFO } from '../config/appVersion';
import { env } from '../config/env';
import { fetchSystemHealth } from '../repositories/systemHealth.repository';
import type { RealtimeHealth, SystemHealth } from '../types/systemHealth';
import { calculateOverallHealth } from '../utils/healthStatus';

const normalizeEnvironment = (value:string) => {
  const normalized=String(value||'DEVELOPMENT').toUpperCase();
  return (['LOCAL','DEVELOPMENT','STAGING','PRODUCTION'].includes(normalized)?normalized:'DEVELOPMENT') as SystemHealth['environment'];
};

export async function getSystemHealth(signal?:AbortSignal){
  const result=await fetchSystemHealth(signal);
  if(!result.data)return result;
  const server=result.data;
  const frontendEnvironment=normalizeEnvironment(env.appEnv);
  const components=[...server.components];
  if(frontendEnvironment!==server.environment){
    components.push({component:'environment',label:'Environment Configuration',status:'WARNING',critical:true,message:`Frontend reports ${frontendEnvironment} while the health service reports ${server.environment}.`,lastCheckedAt:server.checkedAt});
  }
  return {error:null,data:{...server,components,overallStatus:calculateOverallHealth(components),version:{appVersion:server.version.appVersion==='unknown'?BUILD_INFO.appVersion:server.version.appVersion,commitSha:server.version.commitSha||BUILD_INFO.commitSha,buildId:server.version.buildId||BUILD_INFO.buildId,buildTimestamp:server.version.buildTimestamp||BUILD_INFO.buildTimestamp}}};
}

export function mergeRealtimeHealth(health:SystemHealth,realtime:RealtimeHealth):SystemHealth{
  const check={component:'realtime',label:'Realtime',status:realtime.status,operationalStatus:realtime.operationalStatus,critical:false,message:realtime.message,lastCheckedAt:new Date().toISOString(),...(realtime.lastEventAt?{lastSuccessfulAt:realtime.lastEventAt}:{}),metadata:{channelStatus:realtime.channelStatus,reconnectAttempts:realtime.reconnectAttempts}};
  const components=health.components.map(item=>item.component==='realtime'?check:item);
  return {...health,components,overallStatus:calculateOverallHealth(components)};
}
