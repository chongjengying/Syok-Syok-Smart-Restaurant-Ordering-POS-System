import { apiRequest } from '../infrastructure/supabase/functionsClient';
import type { ApiResult } from '../types/api';
import type { SystemHealth } from '../types/systemHealth';

export function fetchSystemHealth(signal?: AbortSignal) {
  return apiRequest('system-health', { signal, timeoutMs: 12_000 }) as Promise<ApiResult<SystemHealth>>;
}
