export type HealthStatus = 'HEALTHY' | 'DEGRADED' | 'WARNING' | 'CRITICAL' | 'UNKNOWN';
export type OperationalStatus = HealthStatus | 'CONNECTED' | 'CONNECTING' | 'RECONNECTING' | 'DISCONNECTED' | 'FAILED' | 'ONLINE' | 'OFFLINE' | 'ERROR' | 'NOT_CONFIGURED';

export interface HealthCheck {
  component: string;
  label: string;
  status: HealthStatus;
  operationalStatus?: OperationalStatus;
  critical: boolean;
  latencyMs?: number;
  message: string;
  lastCheckedAt: string;
  lastSuccessfulAt?: string;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface ApiErrorEvent {
  occurred_at: string;
  service: string;
  endpoint: string;
  method: string;
  status_code: number | null;
  error_type: string | null;
  duration_ms: number | null;
  correlation_id: string;
}

export interface SystemIncident {
  id: string;
  opened_at: string;
  updated_at: string;
  resolved_at: string | null;
  severity: 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';
  component: string;
  error_type: string;
  summary: string;
  status: 'ACTIVE' | 'ACKNOWLEDGED' | 'RESOLVED';
  correlation_id: string | null;
}

export interface SystemHealth {
  overallStatus: HealthStatus;
  environment: 'LOCAL' | 'DEVELOPMENT' | 'STAGING' | 'PRODUCTION';
  version: { appVersion: string; buildId?: string; commitSha?: string; buildTimestamp?: string };
  components: HealthCheck[];
  api: { totalRequests: number; failedRequests: number; failureRate: number; clientErrors: number; serverErrors: number; timeouts: number; recentErrors: ApiErrorEvent[] };
  incidents: SystemIncident[];
  checkedAt: string;
  correlationId: string;
}

export interface RealtimeHealth {
  status: HealthStatus;
  operationalStatus: OperationalStatus;
  channelStatus: string;
  lastEventAt?: string;
  reconnectAttempts: number;
  message: string;
}
