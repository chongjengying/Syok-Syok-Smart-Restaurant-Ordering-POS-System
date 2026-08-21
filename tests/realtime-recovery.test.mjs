import test from 'node:test';
import assert from 'node:assert/strict';
import { createRealtimeRecoveryTracker } from '../src/services/realtime-recovery.service.ts';

test('initial realtime subscription does not duplicate the initial fetch', () => {
  const track = createRealtimeRecoveryTracker();
  assert.deepEqual(track('SUBSCRIBED'), {
    connected: true,
    failed: false,
    shouldRefetch: false,
  });
});

test('realtime reconnection requires an authoritative refetch', () => {
  const track = createRealtimeRecoveryTracker();
  track('SUBSCRIBED');
  assert.deepEqual(track('CHANNEL_ERROR'), {
    connected: false,
    failed: true,
    shouldRefetch: false,
  });
  assert.deepEqual(track('SUBSCRIBED'), {
    connected: true,
    failed: false,
    shouldRefetch: true,
  });
});

test('timeout and closed channel states are treated as visible failures', () => {
  const timedOut = createRealtimeRecoveryTracker()('TIMED_OUT');
  const closed = createRealtimeRecoveryTracker()('CLOSED');
  assert.equal(timedOut.failed, true);
  assert.equal(closed.failed, true);
});
