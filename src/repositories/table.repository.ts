import { apiRequest } from '../infrastructure/supabase/functionsClient';
import { supabase } from '../infrastructure/supabase/client';
import type { ApiResult, RequestOptions } from '../types/api';
import type { RestaurantTableRecord, TableFilters, TableInput, TableStatus } from '../types/table';

export function fetchTables({ status, includeInactive = false, signal }: TableFilters = {}) {
  return apiRequest('tables', {
    query: {
      ...(status ? { status } : {}),
      ...(includeInactive ? { includeInactive: 'true' } : {}),
    },
    signal,
  }) as Promise<ApiResult<RestaurantTableRecord[]>>;
}

export function fetchTable(tableId: string, { signal }: RequestOptions = {}) {
  return apiRequest('tables', { path: tableId, signal }) as Promise<ApiResult<RestaurantTableRecord>>;
}

export function insertTable(input: TableInput) {
  return apiRequest('tables', { method: 'POST', body: input }) as Promise<ApiResult<RestaurantTableRecord>>;
}

export function patchTable(tableId: string, input: TableInput) {
  return apiRequest('tables', { method: 'PATCH', path: tableId, body: input }) as Promise<ApiResult<RestaurantTableRecord>>;
}

export function patchTableStatus(tableId: string, status: TableStatus) {
  return apiRequest('tables', {
    method: 'PATCH',
    path: `${tableId}/status`,
    body: { status },
  }) as Promise<ApiResult<RestaurantTableRecord>>;
}

export function completeCleaning(tableId: string, operationKey: string) {
  return apiRequest('tables', {
    method: 'POST',
    path: `${tableId}/complete-cleaning`,
    body: { operationKey },
  }) as Promise<ApiResult<RestaurantTableRecord>>;
}

export function startCleaning(tableId: string, operationKey: string) {
  return apiRequest('tables', {
    method: 'POST',
    path: `${tableId}/start-cleaning`,
    body: { operationKey },
  }) as Promise<ApiResult<RestaurantTableRecord>>;
}

export function markOutOfService(tableId: string, reason: string, operationKey: string) {
  return apiRequest('tables', {
    method: 'POST',
    path: `${tableId}/out-of-service`,
    body: { reason, operationKey },
  }) as Promise<ApiResult<RestaurantTableRecord>>;
}

export function restoreTable(tableId: string, operationKey: string) {
  return apiRequest('tables', {
    method: 'POST',
    path: `${tableId}/restore`,
    body: { operationKey },
  }) as Promise<ApiResult<RestaurantTableRecord>>;
}

export function moveOrder(orderId: string, destinationTableId: string, operationKey: string) {
  return apiRequest('tables', {
    method: 'POST',
    path: 'move-order',
    body: { orderId, destinationTableId, operationKey },
  }) as Promise<ApiResult<unknown>>;
}

export function removeTable(tableId: string) {
  return apiRequest('tables', { method: 'DELETE', path: tableId }) as Promise<ApiResult<null>>;
}

export function subscribeToTableChanges(
  onChange: (payload: unknown) => void,
  onStatus?: (status: string) => void,
) {
  const channel = supabase
    .channel(`restaurant-tables-${crypto.randomUUID()}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'restaurant_tables' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, onChange)
    .subscribe((status) => onStatus?.(status));
  return () => { void supabase.removeChannel(channel); };
}
