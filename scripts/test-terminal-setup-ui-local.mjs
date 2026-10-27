import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { getLocalSupabaseStatus } from './local-supabase-status.mjs';
const status = getLocalSupabaseStatus();
assert.ok(['localhost','127.0.0.1'].includes(new URL(status.API_URL).hostname),'Local tests only');
let browser, actor, page;
try {
  browser = await chromium.launch({ headless:true });
  page = await browser.newPage({ viewport:{ width:390,height:844 } });
  const errors = [];
  page.on('pageerror',error => errors.push(error.message));
  let signups = 0;
  page.on('request',request => { if (request.url().endsWith('/auth/v1/signup')) signups++; });
  const signupResponse = page.waitForResponse(response => response.url().endsWith('/auth/v1/signup'));
  await page.goto('http://127.0.0.1:5173/pos/setup');
  const signup = await signupResponse;
  assert.ok(signup.ok());
  actor = (await signup.json()).user.id;
  await page.getByRole('heading',{ name:'Welcome to POS' }).waitFor();
  await page.getByRole('button',{ name:'Activate terminal',exact:true }).waitFor();
  // UI failure rendering only: real activation and credential lifecycle run in rollback SQL.
  let activationIdentityPresent = false;
  let activationAccepted = false;
  await page.route('**/rest/v1/rpc/activate_terminal_with_code',async route => {
    const headers = await route.request().allHeaders();
    const payload = route.request().postDataJSON();
    activationIdentityPresent = Boolean(headers.authorization && payload.p_device_identifier?.length >= 32 && !headers['x-pos-device-credential']);
    await route.fulfill({ json:activationAccepted
      ? { ok:true,terminalId:crypto.randomUUID(),terminalCredential:'test-credential-'.repeat(4),terminalCode:'TEST-01',company:{ name:'Test company' },outlet:{ name:'Test branch' },terminal:{ code:'TEST-01' } }
      : { ok:false,code:'INVALID_ACTIVATION_CODE' } });
  });
  const input = page.getByRole('textbox',{ name:'6-digit activation code' });
  await input.fill(String(100000+crypto.getRandomValues(new Uint32Array(1))[0]%900000));
  await page.getByRole('button',{ name:'Activate terminal',exact:true }).click();
  await page.getByRole('alert').filter({ hasText:'invalid or expired' }).waitFor();
  assert.equal(activationIdentityPresent,true,'Activation did not include Auth and the device identifier');
  activationAccepted = true;
  await page.route('**/rest/v1/rpc/resolve_authenticated_terminal',async route => {
    await route.fulfill({ json:{ ok:true,terminalId:crypto.randomUUID(),terminalCode:'TEST-01',terminalName:'Test terminal',branchName:'Test branch',companyName:'Test company' } });
  });
  await page.getByRole('button',{ name:'Activate terminal',exact:true }).click();
  await page.getByRole('button',{ name:'Continue to staff sign in' }).click();
  await page.getByText('Staff sign in',{ exact:true }).waitFor();
  assert.equal(await page.getByText('A valid staff profile could not be loaded.').count(),0,'Activated terminal retained the setup profile');
  assert.equal(signups,1,'Setup created repeated anonymous accounts');
  assert.equal(await page.getByRole('button',{ name:/Switch Staff|Change Terminal/ }).count(),0,'Unactivated device exposes staff/device transition controls');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth>innerWidth+1),false,'Setup page overflows phone width');
  await page.screenshot({ path:'/tmp/pos-terminal-setup-390.png',fullPage:true });
  await page.goto('http://127.0.0.1:5173/admin/login');
  await page.locator('#current-email').waitFor();
  assert.equal(await page.getByRole('heading',{ name:'Welcome to POS' }).count(),0,'Admin login showed terminal setup after anonymous device sign-in');
  await page.goto('http://127.0.0.1:5173/');
  await page.locator('#current-email').waitFor();
  assert.deepEqual(errors,[],'Setup runtime error');
  console.log('VERIFIED PASS: activated terminal opens staff sign-in, and admin routes remain separate from device setup');
} catch (error) {
  await page?.screenshot({ path:'/tmp/pos-terminal-setup-failure.png',fullPage:true });
  console.error((await page?.locator('body').innerText())?.slice(0,1800));
  throw error;
} finally {
  await browser?.close();
  if (actor) {
    const response = await fetch(`${status.API_URL}/auth/v1/admin/users/${actor}`,{ method:'DELETE',headers:{ apikey:status.ANON_KEY,Authorization:`Bearer ${status.SERVICE_ROLE_KEY}` } });
    assert.ok(response.ok,'Temporary setup Auth user cleanup failed');
  }
}
