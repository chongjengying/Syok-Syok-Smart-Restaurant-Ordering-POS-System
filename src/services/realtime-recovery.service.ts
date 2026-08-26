const failureStatuses = new Set(['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED']);

export interface RealtimeRecoveryResult {
  connected: boolean;
  failed: boolean;
  shouldRefetch: boolean;
}

/**
 * Tracks one Supabase channel lifecycle. The first SUBSCRIBED event is part of
 * initial loading; every later SUBSCRIBED event is a reconnect and must refetch
 * authoritative state in case database changes were missed while disconnected.
 */
export function createRealtimeRecoveryTracker() {
  let hasSubscribed = false;

  return (status: string): RealtimeRecoveryResult => {
    const connected = status === 'SUBSCRIBED';
    const shouldRefetch = connected && hasSubscribed;
    if (connected) hasSubscribed = true;

    return {
      connected,
      failed: failureStatuses.has(status),
      shouldRefetch,
    };
  };
}
