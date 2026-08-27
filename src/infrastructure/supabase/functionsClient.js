import { env } from '../../config/env';
import { getApiErrorMessage } from '../../shared/errorMessages';
import { supabase } from './client';
import { classifyApiError, isInfrastructureFailure } from '../../utils/healthStatus';
import { recordApiTelemetry } from '../../services/api-telemetry.service';

const DEFAULT_TIMEOUT_MS = 15_000;

export class ApiError extends Error {
  constructor(message, { status = 0, code = 'REQUEST_FAILED', retryable = false, details = null } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.retryable = retryable;
    this.details = details;
  }
}

function buildQuery(query) {
  if (!query) return '';
  const entries = Object.entries(query).filter(([, value]) => value !== undefined && value !== null);
  const search = new URLSearchParams(entries);
  return search.size ? `?${search.toString()}` : '';
}

export async function apiRequest(
  functionName,
  { method = 'GET', path = '', query, body, signal, timeoutMs = DEFAULT_TIMEOUT_MS } = {},
) {
  const startedAt = performance.now();
  const correlationId = `req_${crypto.randomUUID()}`;
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !sessionData.session) {
    const code = 'SESSION_EXPIRED';
    return {
      data: null,
      error: new ApiError(getApiErrorMessage({ code, status: 401, serverMessage: sessionError?.message }), {
        status: 401, code, retryable: false, details: sessionError || null,
      }),
    };
  }

  const controller = new AbortController();
  const abortFromCaller = () => controller.abort(signal?.reason);
  signal?.addEventListener('abort', abortFromCaller, { once: true });
  const timeout = globalThis.setTimeout(() => controller.abort('Request timed out.'), timeoutMs);
  const search = buildQuery(query);
  const normalizedPath = path ? `/${String(path).replace(/^\/+/, '')}` : '';

  try {
    const response = await fetch(
      `${env.supabaseUrl}/functions/v1/${functionName}${normalizedPath}${search}`,
      {
        method,
        signal: controller.signal,
        headers: {
          apikey: env.supabaseKey,
          Authorization: `Bearer ${sessionData.session.access_token}`,
          'x-correlation-id': correlationId,
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      },
    );

    const payload = response.status === 204 ? null : await response.json().catch(() => null);
    if (!response.ok) {
      const code = payload?.code || (response.status === 401 ? 'SESSION_EXPIRED' : response.status >= 500 ? 'SERVER_ERROR' : 'REQUEST_FAILED');
      const errorType = classifyApiError({ status: response.status, code });
      recordApiTelemetry({ service: functionName, endpoint: `/${functionName}${normalizedPath}`, method, statusCode: response.status, errorType, durationMs: Math.round(performance.now() - startedAt), correlationId, infrastructureFailure: isInfrastructureFailure({ status: response.status, errorType }) });
      return {
        data: null,
        error: new ApiError(getApiErrorMessage({ code, status: response.status, serverMessage: payload?.error }), {
          status: response.status,
          code,
          retryable: Boolean(payload?.retryable) || response.status >= 500,
          details: payload?.details || null,
        }),
      };
    }
    recordApiTelemetry({ service: functionName, endpoint: `/${functionName}${normalizedPath}`, method, statusCode: response.status, errorType: null, durationMs: Math.round(performance.now() - startedAt), correlationId, infrastructureFailure: false });
    return { data: payload?.data ?? payload, error: null };
  } catch (error) {
    if (controller.signal.aborted) {
      const wasCancelled = signal?.aborted;
      if (!wasCancelled) recordApiTelemetry({ service: functionName, endpoint: `/${functionName}${normalizedPath}`, method, statusCode: 0, errorType: 'TIMEOUT', durationMs: Math.round(performance.now() - startedAt), correlationId, infrastructureFailure: true });
      return {
        data: null,
        error: new ApiError(wasCancelled ? 'Request was cancelled.' : getApiErrorMessage({ code: 'REQUEST_TIMEOUT' }), {
          code: wasCancelled ? 'REQUEST_CANCELLED' : 'REQUEST_TIMEOUT',
          retryable: !wasCancelled,
        }),
      };
    }
    recordApiTelemetry({ service: functionName, endpoint: `/${functionName}${normalizedPath}`, method, statusCode: 0, errorType: 'NETWORK_ERROR', durationMs: Math.round(performance.now() - startedAt), correlationId, infrastructureFailure: true });
    return {
      data: null,
      error: new ApiError(getApiErrorMessage({ code: 'NETWORK_ERROR', serverMessage: error?.message }), {
        code: 'NETWORK_ERROR', retryable: true, details: error instanceof Error ? error.message : null,
      }),
    };
  } finally {
    globalThis.clearTimeout(timeout);
    signal?.removeEventListener('abort', abortFromCaller);
  }
}
