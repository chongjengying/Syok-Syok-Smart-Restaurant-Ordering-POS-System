import { useCallback, useState } from 'react';
import {
  completeTableCleaning,
  moveOrderToTable,
  createTable,
  updateTable,
  restoreRestaurantTable,
  setTableOutOfService,
  startTableCleaning,
  transitionTable,
} from '../services/table.service';
import { useTables } from './useTables';
import { getUserErrorMessage } from '../shared/errorMessages';

export function useTableManagement(enabled, { includeInactive = false, branchId } = {}) {
  const tableState = useTables(enabled, { includeInactive, branchId });
  const { refresh } = tableState;
  const [updatingId, setUpdatingId] = useState(null);
  const [actionError, setActionError] = useState('');
  const [actionMessage, setActionMessage] = useState('');

  const execute = useCallback(async (key, operation, successMessage) => {
    if (updatingId) return { data: null, error: new Error('Another table operation is in progress.') };
    setUpdatingId(key);
    setActionError('');
    setActionMessage('');
    try {
      const result = await operation();
      if (result.error) setActionError(getUserErrorMessage(result.error, 'The table operation could not be completed.'));
      else {
        await refresh();
        setActionMessage(successMessage);
      }
      return result;
    } catch (error) {
      setActionError(getUserErrorMessage(error, 'The table operation could not be completed.'));
      return { data: null, error };
    } finally {
      setUpdatingId(null);
    }
  }, [refresh, updatingId]);

  return {
    ...tableState,
    updatingId,
    actionError,
    actionMessage,
    reserve: (tableId) => execute(tableId, () => transitionTable(tableId, 'RESERVED'), 'Table reserved successfully.'),
    releaseReservation: (tableId) => execute(tableId, () => transitionTable(tableId, 'AVAILABLE'), 'Table reservation released successfully.'),
    completeCleaning: (tableId) => execute(tableId, () => completeTableCleaning(tableId), 'Table is ready for guests.'),
    startCleaning: (tableId) => execute(tableId, () => startTableCleaning(tableId), 'Table cleaning started.'),
    setOutOfService: (tableId, reason) => execute(tableId, () => setTableOutOfService(tableId, reason), 'Table marked out of service.'),
    restore: (tableId) => execute(tableId, () => restoreRestaurantTable(tableId), 'Table restored successfully.'),
    moveOrder: (orderId, destinationTableId, expectedSourceTableId) => execute(
      orderId,
      () => moveOrderToTable(orderId, destinationTableId, expectedSourceTableId),
      'Order moved successfully.',
    ),
    create: (input) => execute('new-table', () => createTable({ ...input, branchId }), 'Table created successfully.'),
    edit: (tableId, input) => execute(tableId, () => updateTable(tableId, input), 'Table updated successfully.'),
  };
}
