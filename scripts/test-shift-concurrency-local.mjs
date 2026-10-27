import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { getLocalSupabaseStatus } from './local-supabase-status.mjs';

assert.ok(['127.0.0.1', 'localhost'].includes(new URL(getLocalSupabaseStatus().API_URL).hostname), 'Local database test only');

const args = ['exec', '-i', 'supabase_db_Pos_Order', 'psql', '-U', 'postgres', '-d', 'postgres', '-At', '-v', 'ON_ERROR_STOP=1'];
const sql = query => execFileSync('docker', args, { input: query, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
const candidate = sql(`select json_build_object('company',b.company_id,'branch',b.id,'actor',p.id)
 from public.branches b join public.profiles p on p.company_id=b.company_id and p.status='ACTIVE'
 where b.status='ACTIVE' limit 1;`);
assert.ok(candidate, 'An active local branch and profile are required');
const context = JSON.parse(candidate);
for (const value of Object.values(context)) assert.match(value, /^[0-9a-f-]{36}$/);
const terminal = crypto.randomUUID();
const insertShift = () => `insert into public.cashier_shifts(company_id,branch_id,terminal_id,shift_number,opened_by_staff_id,opening_float)
 values('${context.company}','${context.branch}','${terminal}','QA-${crypto.randomUUID()}','${context.actor}',300);`;
let first, created = false;
try {
  // Only a temporary terminal is committed for shared FK visibility. All
  // financial writes roll back. Existing terminals and shifts are untouched.
  sql(`insert into public.pos_terminals(id,company_id,branch_id,terminal_code,name)
   values('${terminal}','${context.company}','${context.branch}','QA-${terminal.slice(0,8)}','Concurrency QA');`);
  created = true;
  first = spawn('docker', args, { stdio: ['pipe', 'pipe', 'pipe'] });
  let output = '', errors = '';
  const done = new Promise(resolve => first.on('close', code => resolve(code)));
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out waiting for local shift lock')), 10000);
    first.stdout.on('data', chunk => { output += chunk; if (output.includes('SHIFT_LOCK_HELD')) { clearTimeout(timer); resolve(); } });
    first.stderr.on('data', chunk => { errors += chunk; });
    first.on('close', code => { clearTimeout(timer); if (!output.includes('SHIFT_LOCK_HELD')) reject(new Error(`Local shift opener failed (${code}): ${errors}`)); });
  });
  first.stdin.end(`begin; ${insertShift()}\n\\echo SHIFT_LOCK_HELD\nselect pg_sleep(3); rollback;`);
  await ready;
  let rejected = false;
  try { sql(`begin; set local lock_timeout='200ms'; ${insertShift()} rollback;`); }
  catch (error) { rejected = /lock timeout/.test(String(error.stderr)); }
  assert.equal(rejected, true, 'Overlapping open shifts bypassed the unique terminal constraint');
  assert.equal(await done, 0, 'Initial opener failed to roll back');
  sql(`begin; ${insertShift()} rollback;`);
  assert.equal(sql(`select count(*) from public.cashier_shifts where terminal_id='${terminal}';`), '0', 'Concurrency test left financial records');
  console.log('VERIFIED PASS: database unique constraint serializes overlapping open shifts; bounded contender timeout; retry succeeds after rollback. Authenticated shift RPCs are covered separately.');
} finally {
  if (first && first.exitCode == null) {
    first.kill();
    await new Promise(resolve => first.once('close', resolve));
  }
  if (created) {
    sql(`delete from public.pos_terminals where id='${terminal}' and not exists(select 1 from public.cashier_shifts where terminal_id='${terminal}');`);
    assert.equal(sql(`select count(*) from public.pos_terminals where id='${terminal}';`), '0', 'Temporary concurrency terminal was not cleaned');
  }
}
