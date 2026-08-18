import { useCallback, useState } from 'react';
import {
  completeTableCleaning,
  moveOrderToTable,
  restoreRestaurantTable,
  setTableOutOfService,
  startTableCleaning,
  transitionTable,
} from '../services/table.service';
import { useTables } from './useTables';
import { getUserErrorMessage } from '../shared/errorMessages';

export function useTableManagement(enabled, { includeInactive = false } = {}) {
  const tableState = useTables(enabled, { includeInactive });
  const { refresh } = tableState;
  const [updatingId, setUpdatingId] = useState(null);
  const [actionError, setActionError] = useState('');

  const execute = useCallback(async (key, operation) => {
    if (updatingId) return { data: null, error: new Error('Another table operation is in progress.') };
    setUpdatingId(key);
    setActionError('');
    const result = await operation();
    if (result.error) setActionError(getUserErrorMessage(result.error, 'The table operation could not be completed.'));
    else await refresh();
    setUpdatingId(null);
    return result;
  }, [refresh, updatingId]);

  return {
    ...tableState,
    updatingId,
    actionError,
    reserve: (tableId) => execute(tableId, () => transitionTable(tableId, 'RESERVED')),
    releaseReservation: (tableId) => execute(tableId, () => transitionTable(tableId, 'AVAILABLE')),
    completeCleaning: (tableId) => execute(tableId, () => completeTableCleaning(tableId)),
    startCleaning: (tableId) => execute(tableId, () => startTableCleaning(tableId)),
    setOutOfService: (tableId, reason) => execute(tableId, () => setTableOutOfService(tableId, reason)),
    restore: (tableId) => execute(tableId, () => restoreRestaurantTable(tableId)),
    moveOrder: (orderId, destinationTableId) => execute(orderId, () => moveOrderToTable(orderId, destinationTableId)),
  };
}
