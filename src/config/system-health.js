export const SYSTEM_HEALTH_CONFIG = Object.freeze({
  refreshMs: 45_000,
  requestTimeoutMs: 12_000,
  latency: Object.freeze({ healthyMs: 500, warningMs: 1_500 }),
  database: Object.freeze({ healthyMs: 500, warningMs: 1_500 }),
  backup: Object.freeze({ warningHours: 24, criticalHours: 48 }),
  kds: Object.freeze({ onlineSeconds: 30, warningSeconds: 60 }),
  api: Object.freeze({ warningFailureRate: 0.01, criticalFailureRate: 0.05 }),
});
