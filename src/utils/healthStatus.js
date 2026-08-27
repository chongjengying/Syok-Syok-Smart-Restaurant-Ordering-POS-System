import { SYSTEM_HEALTH_CONFIG } from '../config/system-health.js';

export const HEALTH_RANK = Object.freeze({ UNKNOWN: 0, HEALTHY: 1, DEGRADED: 2, WARNING: 3, CRITICAL: 4 });

export function statusFromLatency(latencyMs, thresholds = SYSTEM_HEALTH_CONFIG.latency) {
  if (!Number.isFinite(latencyMs) || latencyMs < 0) return 'UNKNOWN';
  if (latencyMs < thresholds.healthyMs) return 'HEALTHY';
  if (latencyMs <= thresholds.warningMs) return 'WARNING';
  return 'DEGRADED';
}

export function statusFromBackupAge(ageHours, thresholds = SYSTEM_HEALTH_CONFIG.backup) {
  if (!Number.isFinite(ageHours) || ageHours < 0) return 'UNKNOWN';
  if (ageHours < thresholds.warningHours) return 'HEALTHY';
  if (ageHours <= thresholds.criticalHours) return 'WARNING';
  return 'CRITICAL';
}

export function statusFromKdsHeartbeat(ageSeconds, thresholds = SYSTEM_HEALTH_CONFIG.kds) {
  if (!Number.isFinite(ageSeconds) || ageSeconds < 0) return 'UNKNOWN';
  if (ageSeconds < thresholds.onlineSeconds) return 'HEALTHY';
  if (ageSeconds <= thresholds.warningSeconds) return 'WARNING';
  return 'CRITICAL';
}

export function calculateOverallHealth(components) {
  const checks = Array.isArray(components) ? components : [];
  if (!checks.length) return 'UNKNOWN';
  if (checks.some(item => item.critical && item.status === 'CRITICAL')) return 'CRITICAL';
  if (checks.some(item => item.status === 'CRITICAL')) return 'WARNING';
  if (checks.some(item => item.status === 'WARNING')) return 'WARNING';
  if (checks.some(item => item.status === 'DEGRADED')) return 'DEGRADED';
  if (checks.some(item => item.status === 'HEALTHY')) return 'HEALTHY';
  return 'UNKNOWN';
}

export function classifyApiError({ status = 0, code = '', timedOut = false } = {}) {
  const normalized = String(code).toUpperCase();
  if (timedOut || normalized.includes('TIMEOUT')) return 'TIMEOUT';
  if (status === 401 || normalized.includes('AUTH')) return 'AUTH_ERROR';
  if (status === 403 || normalized.includes('PERMISSION')) return 'PERMISSION_ERROR';
  if (status === 0 || normalized.includes('NETWORK')) return 'NETWORK_ERROR';
  if (normalized.includes('DATABASE')) return 'DATABASE_ERROR';
  if (normalized.includes('PAYMENT') || normalized.includes('PROVIDER')) return 'PAYMENT_PROVIDER_ERROR';
  if (status >= 500) return 'INTERNAL_ERROR';
  if (status >= 400) return 'VALIDATION_ERROR';
  return 'INTERNAL_ERROR';
}

export function isInfrastructureFailure({ status = 0, errorType = '' } = {}) {
  return status === 0 || status >= 500 || ['TIMEOUT','NETWORK_ERROR','DATABASE_ERROR','DEPENDENCY_ERROR','PAYMENT_PROVIDER_ERROR','DEVICE_ERROR','INTERNAL_ERROR'].includes(errorType);
}
