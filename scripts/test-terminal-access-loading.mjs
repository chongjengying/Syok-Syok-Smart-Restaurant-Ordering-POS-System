import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/components/admin/TerminalStaffAccessEditor.jsx', import.meta.url), 'utf8');
const start = source.indexOf('  useEffect(() => {');
const end = source.indexOf('  const change =', start);
const state = {};
const requests = [];
let cleanup;
let draft;
const deps = {
  useEffect: callback => { cleanup = callback(); },
  fetchTerminalAccessConfiguration: id => new Promise(resolve => requests.push({ id, resolve })),
  listBranchTerminalStaff: id => new Promise(resolve => requests.push({ id, resolve })),
  onChange: value => { draft = value; },
};
for (const name of ['LoadedKey', 'Staff', 'Selected', 'Error', 'Search', 'Mode']) {
  deps[`set${name}`] = value => { state[name] = value; };
}
const run = new Function(...Object.keys(deps), 'terminalId', 'branchId', 'key', source.slice(start, end));
run(...Object.values(deps), 'terminal', 'main', 'terminal:main');
assert.deepEqual(state.Staff, []);
assert.equal(draft, null);
cleanup();
run(...Object.values(deps), 'terminal', 'other', 'terminal:other');
requests[0].resolve({ data: { accessMode: 'SELECTED_STAFF', staff: [{ id: 'main-staff', selected: true }] } });
await Promise.resolve();
assert.equal(state.LoadedKey, '');
requests[1].resolve({ data: { accessMode: 'SELECTED_STAFF', staff: [{ id: 'other-staff', selected: true }] } });
await Promise.resolve();
assert.equal(state.LoadedKey, 'terminal:other');
assert.deepEqual(draft.staffIds, ['other-staff']);
cleanup();
run(...Object.values(deps), 'terminal', 'main', 'terminal:main');
requests[2].resolve({ error: new Error('Denied') });
await Promise.resolve();
assert.equal(state.LoadedKey, '');
assert.deepEqual(state.Staff, []);
assert.equal(draft, null);
cleanup();
run(...Object.values(deps), undefined, 'other', 'new:other');
requests[3].resolve({ data: [{ id: 'new-staff' }] });
await Promise.resolve();
assert.equal(draft.accessMode, 'ALL_BRANCH_STAFF');
assert.deepEqual(draft.staffIds, []);
console.log('Terminal access branch changes, stale responses, loading failures, and creation defaults passed');
