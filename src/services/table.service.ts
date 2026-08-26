import { TABLE_STATUSES } from '../shared/constants';
import {
  completeCleaning,
  fetchTable,
  fetchTables,
  insertTable,
  markOutOfService,
  moveOrder,
  patchTable,
  patchTableStatus,
  removeTable,
  restoreTable,
  startCleaning,
  subscribeToTableChanges,
} from '../repositories/table.repository';
import type { ApiResult } from '../types/api';
import type { RestaurantTable, RestaurantTableRecord, TableFilters, TableInput, TableStatus } from '../types/table';

function mapTable(table: RestaurantTableRecord): RestaurantTable {
  const visibleOrders = Array.isArray(table.orders)
    ? table.orders.filter((order) => {
      const financiallyActive = ['UNPAID', 'PARTIALLY_PAID'].includes(order.payment_status)
        && ['DRAFT', 'CONFIRMED', 'PREPARING', 'READY', 'SERVED'].includes(order.status);
      const paidKitchenActive = order.payment_status === 'PAID'
        && order.status === 'COMPLETED'
        && (order.order_items || []).some((item) => ['SUBMITTED', 'PREPARING', 'READY'].includes(item.item_status));
      return financiallyActive || paidKitchenActive;
    }).sort((left, right) => Date.parse(right.created_at) - Date.parse(left.created_at))
    : [];
  const mappedOrders = visibleOrders.map((order) => ({
    id: order.id,
    orderNumber: order.order_number,
    status: order.status,
    paymentStatus: order.payment_status,
    total: Number(order.total || 0),
    createdAt: order.created_at,
  }));
  const activeOrder = mappedOrders.find((order) => ['UNPAID', 'PARTIALLY_PAID'].includes(order.paymentStatus))
    || mappedOrders[0]
    || null;
  return {
    id: table.id,
    tableNumber: table.table_number,
    tableName: table.table_name,
    capacity: table.capacity,
    status: table.status,
    area: table.area,
    qrCode: table.qr_code,
    isActive: table.is_active,
    activeOrder,
    orders: mappedOrders,
  };
}

function mapResult(result: ApiResult<RestaurantTableRecord>): ApiResult<RestaurantTable> {
  if (result.error || !result.data) return { data: null, error: result.error };
  return { data: mapTable(result.data), error: null };
}

export async function getTables(filters: TableFilters = {}): Promise<ApiResult<RestaurantTable[]>> {
  const result = await fetchTables(filters);
  if (result.error || !result.data) return { data: null, error: result.error };
  return { data: result.data.map(mapTable), error: null };
}

export function getAvailableTables(options: Omit<TableFilters, 'status'> = {}) {
  return getTables({ ...options, status: TABLE_STATUSES.AVAILABLE as TableStatus });
}

export function getAllTables(options: Omit<TableFilters, 'includeInactive'> = {}) {
  return getTables({ ...options, includeInactive: true });
}

export async function getTableById(tableId: string, options: { signal?: AbortSignal } = {}) {
  return mapResult(await fetchTable(tableId, options));
}

export async function createTable(input: TableInput) {
  return mapResult(await insertTable(input));
}

export async function updateTable(tableId: string, input: TableInput) {
  return mapResult(await patchTable(tableId, input));
}

export async function transitionTable(tableId: string, status: TableStatus) {
  return mapResult(await patchTableStatus(tableId, status));
}

export function releaseTable(tableId: string) {
  return transitionTable(tableId, TABLE_STATUSES.AVAILABLE as TableStatus);
}

export function reserveTable(tableId: string) {
  return transitionTable(tableId, TABLE_STATUSES.RESERVED as TableStatus);
}

export async function completeTableCleaning(tableId: string, operationKey = crypto.randomUUID()) {
  if (!tableId) return { data: null, error: new Error('Table ID is required.') };
  return mapResult(await completeCleaning(tableId, operationKey));
}

export async function startTableCleaning(tableId: string, operationKey = crypto.randomUUID()) {
  if (!tableId) return { data: null, error: new Error('Table ID is required.') };
  return mapResult(await startCleaning(tableId, operationKey));
}

export async function setTableOutOfService(
  tableId: string,
  reason = '',
  operationKey = crypto.randomUUID(),
) {
  if (!tableId) return { data: null, error: new Error('Table ID is required.') };
  return mapResult(await markOutOfService(tableId, String(reason).slice(0, 500), operationKey));
}

export async function restoreRestaurantTable(tableId: string, operationKey = crypto.randomUUID()) {
  if (!tableId) return { data: null, error: new Error('Table ID is required.') };
  return mapResult(await restoreTable(tableId, operationKey));
}

export function moveOrderToTable(
  orderId: string,
  destinationTableId: string,
  operationKey = crypto.randomUUID(),
) {
  if (!orderId || !destinationTableId) {
    return Promise.resolve({ data: null, error: new Error('Order and destination table are required.') });
  }
  return moveOrder(orderId, destinationTableId, operationKey);
}

export const deleteTable = removeTable;
export const subscribeToTables = subscribeToTableChanges;
