import assert from 'node:assert/strict';
import { toLocalDateTimeInput } from '../src/shared/dateTimeInput.js';
const previous = process.env.TZ;
try {
  for (const [zone, expected] of [
    ['Asia/Kuala_Lumpur', '2026-10-12T08:30:45.123'],
    ['UTC', '2026-10-12T00:30:45.123'],
    ['America/New_York', '2026-10-11T20:30:45.123'],
  ]) {
    process.env.TZ = zone;
    const stored = '2026-10-12T00:30:45.123Z';
    const input = toLocalDateTimeInput(stored);
    assert.equal(input, expected, zone);
    assert.equal(new Date(input).toISOString(), stored, zone + ' timestamp round trip');
    assert.equal(toLocalDateTimeInput('2026-10-12T09:00'), '2026-10-12T09:00:00.000');
  }
  assert.equal(toLocalDateTimeInput(null), '');
  assert.equal(toLocalDateTimeInput(''), '');
  assert.equal(toLocalDateTimeInput('invalid'), '');
  console.log('VERIFIED PASS: local date fields, day rollover, milliseconds, edited local values and empty/invalid dates.');
} finally {
  if (previous === undefined) delete process.env.TZ;
  else process.env.TZ = previous;
}
